import json
from pathlib import Path

import typer
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import get_session_factory
from app.services.rag import answer_question
from app.services.rag_admin import embed_external_updates_backfill
from app.services.seed import ensure_admin_user, ensure_minimal_rag_seed
from app.services.transcripts import fetch_transcripts_batch

cli = typer.Typer()


@cli.command()
def seed_admin() -> None:
    with get_session_factory()() as db:
        user = ensure_admin_user(db)
        db.commit()
        typer.echo(f"admin ready: {user.email}")


@cli.command()
def seed_demo() -> None:
    with get_session_factory()() as db:
        ensure_minimal_rag_seed(db)
        typer.echo("demo seed ready")


@cli.command("fetch-transcripts")
def fetch_transcripts(
    artist_id: int = typer.Option(1, "--artist-id", min=1),
    limit: int = typer.Option(25, "--limit", min=1, max=100),
    days: int | None = typer.Option(None, "--days", min=1, max=3650),
    force: bool = typer.Option(False, "--force"),
) -> None:
    with get_session_factory()() as db:
        result = fetch_transcripts_batch(
            db,
            artist_id,
            limit=limit,
            days=days,
            force=force,
        )
        db.commit()
    typer.echo(json.dumps(result, ensure_ascii=False))


@cli.command("embed-external-updates")
def embed_external_updates(
    artist_id: int = typer.Option(1, "--artist-id", min=1),
    limit: int = typer.Option(100, "--limit", min=1, max=1000),
) -> None:
    with get_session_factory()() as db:
        result = embed_external_updates_backfill(db, artist_id, limit=limit)
        db.commit()
    typer.echo(json.dumps(result, ensure_ascii=False))


def _matches_expect(source: dict, expect: dict) -> bool:
    source_type = expect.get("source_type")
    if source_type is not None and source.get("source_type") != source_type:
        return False
    title_terms = expect.get("title_contains_any") or []
    if not title_terms:
        return True
    title = str(source.get("title") or "").lower()
    return any(str(term).lower() in title for term in title_terms)


def _load_golden(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict) or not isinstance(row.get("question"), str):
                raise typer.BadParameter(f"invalid golden row at line {line_number}")
            expect = row.get("expect")
            if not isinstance(expect, dict):
                raise typer.BadParameter(f"invalid expect at line {line_number}")
            rows.append(row)
    return rows


@cli.command("eval-search")
def eval_search(
    golden: Path = typer.Option(Path("eval/golden.jsonl"), "--golden"),
    limit: int = typer.Option(10, "--limit", min=1),
) -> None:
    rows = _load_golden(golden)
    hits = {1: 0, 5: 0, 10: 0}

    try:
        with get_session_factory()() as db:
            for index, row in enumerate(rows, start=1):
                question = row["question"]
                _, sources, _, _, _ = answer_question(
                    db,
                    question,
                    artist_id=1,
                    limit=limit,
                    include_answer=False,
                )
                matched_ranks = [
                    rank
                    for rank, source in enumerate(sources, start=1)
                    if _matches_expect(source, row["expect"])
                ]
                first_rank = matched_ranks[0] if matched_ranks else None
                for k in hits:
                    if first_rank is not None and first_rank <= min(k, limit):
                        hits[k] += 1
                status = f"hit@{first_rank}" if first_rank is not None else "miss"
                top_title = sources[0]["title"] if sources else "-"
                typer.echo(f"{index}. {status} | {question} | top={top_title}")
    except SQLAlchemyError as exc:
        reason = str(exc).splitlines()[0]
        typer.echo(f"database unavailable for eval-search; counting all rows as miss: {reason}")
        for index, row in enumerate(rows, start=1):
            typer.echo(f"{index}. miss | {row['question']} | top=-")

    total = len(rows)
    if total == 0:
        typer.echo("summary: no golden rows")
        return
    typer.echo(
        "summary: "
        f"hit@1={hits[1]}/{total} ({hits[1] / total:.2%}), "
        f"hit@5={hits[5]}/{total} ({hits[5] / total:.2%}), "
        f"hit@10={hits[10]}/{total} ({hits[10] / total:.2%})"
    )


if __name__ == "__main__":
    cli()
