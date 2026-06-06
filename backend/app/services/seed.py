from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Artist, ArtistKeyword, Member, Post, Tag, User
from app.services.rag import refresh_post_chunks


def ensure_rescene_seed(db: Session) -> Artist:
    artist = db.scalar(select(Artist).where(Artist.slug == "rescene"))
    if artist is None:
        artist = Artist(
            slug="rescene",
            name="RESCENE",
            description="RESCENE fan community seed artist.",
        )
        db.add(artist)
        db.flush()

    existing_members = {member.name for member in artist.members}
    for name in ["Woni", "Liv", "Minami", "May", "Zena"]:
        if name not in existing_members:
            db.add(Member(artist_id=artist.id, name=name))

    existing_keywords = {keyword.keyword for keyword in artist.keywords}
    for keyword in ["RESCENE", "리센느", "Love Attack", "UhUh"]:
        if keyword not in existing_keywords:
            db.add(ArtistKeyword(artist_id=artist.id, keyword=keyword))

    db.flush()
    return artist


def ensure_admin_user(db: Session) -> User:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == settings.seed_admin_email))
    if user is None:
        user = User(
            email=settings.seed_admin_email,
            display_name="Admin",
            hashed_password=hash_password(settings.seed_admin_password),
            role="admin",
        )
        db.add(user)
        db.flush()
    else:
        user.role = "admin"
        user.hashed_password = hash_password(settings.seed_admin_password)
    return user


def ensure_minimal_rag_seed(db: Session) -> None:
    artist = ensure_rescene_seed(db)
    admin = ensure_admin_user(db)
    titles = {
        "리센느 입덕 포인트": "리센느는 청량한 무대와 선명한 콘셉트가 강점인 그룹입니다.",
        "Love Attack 무대 이야기": "Love Attack 활동에서는 멤버들의 보컬 색과 퍼포먼스 합이 돋보였습니다.",
        "팬 커뮤니티 이용 안내": "이 게시판은 리센느 소식과 팬 반응을 모아 RAG 답변의 근거로 사용합니다.",
    }
    for title, content in titles.items():
        post = db.scalar(select(Post).where(Post.title == title))
        if post is None:
            post = Post(title=title, content=content, author_id=admin.id, artist_id=artist.id)
            db.add(post)
            db.flush()
        if not post.rag_chunks:
            refresh_post_chunks(db, post)
    for tag_name in ["rescene", "stage", "notice"]:
        if db.scalar(select(Tag).where(Tag.name == tag_name)) is None:
            db.add(Tag(name=tag_name))
    db.commit()
