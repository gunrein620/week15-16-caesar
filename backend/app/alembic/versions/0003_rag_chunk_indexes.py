"""add rag chunk indexes

Revision ID: 0003_rag_chunk_indexes
Revises: 0002_youtube_video_stats
Create Date: 2026-06-07 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0003_rag_chunk_indexes"
down_revision: str | None = "0002_youtube_video_stats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(column_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bool(
            bind.execute(
                sa.text(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'rag_chunks'
                          AND column_name = :column_name
                    )
                    """
                ),
                {"column_name": column_name},
            ).scalar_one()
        )
    if bind.dialect.name == "sqlite":
        rows = bind.execute(sa.text("PRAGMA table_info(rag_chunks)")).mappings().all()
        return any(row["name"] == column_name for row in rows)
    return column_name in {
        column["name"] for column in inspect(bind).get_columns("rag_chunks")
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    added_column = False
    if not _column_exists("chunk_index"):
        op.add_column(
            "rag_chunks",
            sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        )
        added_column = True
    if added_column and bind.dialect.name in {"postgresql", "sqlite"}:
        op.execute(
            """
            WITH indexed AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY post_id
                        ORDER BY id
                    ) - 1 AS next_index
                FROM rag_chunks
                WHERE post_id IS NOT NULL
            )
            UPDATE rag_chunks
            SET chunk_index = indexed.next_index
            FROM indexed
            WHERE rag_chunks.id = indexed.id
            """
        )
        op.execute(
            """
            WITH indexed AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY youtube_video_id
                        ORDER BY id
                    ) - 1 AS next_index
                FROM rag_chunks
                WHERE youtube_video_id IS NOT NULL
            )
            UPDATE rag_chunks
            SET chunk_index = indexed.next_index
            FROM indexed
            WHERE rag_chunks.id = indexed.id
            """
        )
    if added_column:
        op.alter_column("rag_chunks", "chunk_index", server_default=None)
    existing_indexes = {index["name"] for index in inspector.get_indexes("rag_chunks")}
    if "ux_rag_chunk_post_index" not in existing_indexes:
        op.create_index(
            "ux_rag_chunk_post_index",
            "rag_chunks",
            ["post_id", "chunk_index"],
            unique=True,
            postgresql_where=sa.text("post_id IS NOT NULL"),
            sqlite_where=sa.text("post_id IS NOT NULL"),
        )
    if "ux_rag_chunk_youtube_index" not in existing_indexes:
        op.create_index(
            "ux_rag_chunk_youtube_index",
            "rag_chunks",
            ["youtube_video_id", "chunk_index"],
            unique=True,
            postgresql_where=sa.text("youtube_video_id IS NOT NULL"),
            sqlite_where=sa.text("youtube_video_id IS NOT NULL"),
        )


def downgrade() -> None:
    op.drop_index("ux_rag_chunk_youtube_index", table_name="rag_chunks")
    op.drop_index("ux_rag_chunk_post_index", table_name="rag_chunks")
    op.drop_column("rag_chunks", "chunk_index")
