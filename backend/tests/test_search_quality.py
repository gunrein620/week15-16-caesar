from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.config import reset_settings_cache
from app.core.db import get_session_factory
from app.models import Post, RagChunk, User
from app.schemas import UpdateFeedItem
from app.services.archive_search import (
    _ChunkSource,
    _matches_archive_terms,
    _source_boost,
    search_archive_candidates,
)
from app.services.rag import _matches_temporal_archive_terms, answer_question, similar_posts
from app.services.search_intent import ArchiveTermMatch, SearchIntent
from app.services.text import deterministic_embedding


def _term(
    title: str,
    *aliases: str,
    term_type: str = "song",
    term_id: int = 1,
) -> ArchiveTermMatch:
    return ArchiveTermMatch(
        id=term_id,
        term_type=term_type,
        title=title,
        aliases=aliases,
        raw_aliases=(title, *aliases),
    )


def _admin_id(db) -> int:
    return db.scalar(select(User.id).where(User.email == "admin@example.com"))


def _add_post_chunk(db, *, title: str, content: str, artist_id: int = 1) -> tuple[Post, RagChunk]:
    post = Post(
        title=title,
        content=content,
        author_id=_admin_id(db),
        artist_id=artist_id,
    )
    db.add(post)
    db.flush()
    chunk = RagChunk(
        artist_id=artist_id,
        post_id=post.id,
        chunk_index=0,
        content=f"{title}\n\n{content}",
        content_hash=f"hash-{post.id}",
        embedding=deterministic_embedding(f"{title}\n\n{content}"),
    )
    db.add(chunk)
    db.flush()
    return post, chunk


def test_source_boost_is_capped_at_small_total():
    source = _ChunkSource(
        key=("youtube", "boost-cap"),
        title="Love Attack Woni Liv May Zena live fancam",
        tags=("러브어택", "원이", "리브", "메이", "제나"),
        source_type="youtube",
    )
    intent = SearchIntent(
        question="러브어택 원이 리브 메이 제나 라이브 영상",
        artist_id=1,
        media_type="youtube",
        include_terms=("원이", "리브", "메이"),
        boost_terms=("제나", "라이브", "직캠"),
        archive_terms=[
            _term("Love Attack", "loveattack", "러브어택", term_id=1),
            _term("Live", "live", "라이브", term_type="activity", term_id=2),
            _term("Fancam", "fancam", "직캠", term_type="activity", term_id=3),
        ],
    )

    assert _source_boost(source, intent) == pytest.approx(0.35)


def test_archive_terms_match_any_term():
    source = _ChunkSource(
        key=("post", "1"),
        title="Love Attack 무대 이야기",
        tags=(),
        source_type="post",
    )
    intent = SearchIntent(
        question="러브어택 데자부",
        artist_id=1,
        archive_terms=[
            _term("Love Attack", "loveattack", "러브어택", term_id=1),
            _term("Deja Vu", "dejavu", "데자부", term_id=2),
        ],
    )

    assert _matches_archive_terms(source, intent) is True


def test_temporal_archive_terms_match_any_term():
    item = UpdateFeedItem(
        id="youtube:any-match",
        item_type="youtube",
        title="RESCENE Love Attack live",
        description="오늘 올라온 영상",
        url="https://example.com",
        source_label="YouTube",
        published_at=datetime.now(UTC),
    )
    intent = SearchIntent(
        question="러브어택 데자부",
        artist_id=1,
        archive_terms=[
            _term("Love Attack", "loveattack", "러브어택", term_id=1),
            _term("Deja Vu", "dejavu", "데자부", term_id=2),
        ],
    )

    assert _matches_temporal_archive_terms(item, intent) is True


def test_lexical_search_ignores_spaces_for_korean_terms(client):
    with get_session_factory()() as db:
        post, _ = _add_post_chunk(
            db,
            title="러브어택 공백 표기 자료",
            content="러브어택은 공백 없이 적힌 활동명입니다.",
        )
        post_id = post.id
        db.commit()

        candidates = search_archive_candidates(
            db,
            "러브 어택 자료 찾아줘",
            artist_id=1,
            limit=10,
        )

    assert post_id in [candidate.post_id for candidate in candidates]


def test_similar_posts_reuses_stored_chunk_embeddings(client, monkeypatch):
    with get_session_factory()() as db:
        source, _ = _add_post_chunk(
            db,
            title="원이 보컬 분석",
            content="원이 보컬과 무대 톤을 정리합니다.",
        )
        close, _ = _add_post_chunk(
            db,
            title="원이 무대 리뷰",
            content="원이 보컬과 무대 표현을 다시 봅니다.",
        )
        source_id = source.id
        close_id = close.id
        _add_post_chunk(
            db,
            title="팬 커뮤니티 공지",
            content="게시판 이용 안내입니다.",
        )
        db.commit()

        calls = {"count": 0}

        def fail_embed(text: str) -> list[float]:
            calls["count"] += 1
            raise AssertionError("similar_posts should reuse stored chunk embeddings")

        monkeypatch.setattr("app.services.rag.embed_text", fail_embed)

        results = similar_posts(db, source_id, limit=2)

    assert calls["count"] == 0
    assert close_id in [post.id for post in results]


def test_rerank_sources_returns_none_without_api_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    reset_settings_cache()

    from app.services.rerank import rerank_sources

    assert rerank_sources("질문", [{"id": 1, "title": "제목", "snippet": "본문"}], 1) is None


def test_answer_question_applies_rerank_order(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    reset_settings_cache()

    with get_session_factory()() as db:
        first, _ = _add_post_chunk(
            db,
            title="첫 번째 후보",
            content="재랭커 적용 전 후보입니다.",
        )
        second, second_chunk = _add_post_chunk(
            db,
            title="두 번째 후보",
            content="재랭커가 이 후보를 앞으로 보냅니다.",
        )
        first_id = first.id
        second_id = second.id
        second_chunk_id = second_chunk.id
        db.commit()

        monkeypatch.setattr(
            "app.services.rag.embed_text",
            lambda text: deterministic_embedding(text),
        )
        monkeypatch.setattr(
            "app.services.rerank.rerank_sources",
            lambda question, candidates, top_k: [second_chunk_id],
        )

        _, sources, _, _, _ = answer_question(
            db,
            "재랭커 순서 테스트",
            artist_id=1,
            limit=2,
            include_answer=False,
            search_intent_payload={"route": "archive"},
        )

    assert first_id != second_id
    assert sources[0]["post_id"] == second_id
