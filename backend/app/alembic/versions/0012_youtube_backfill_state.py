"""add youtube backfill state

Revision ID: 0012_youtube_backfill_state
Revises: 0011_artist_archive_terms
Create Date: 2026-06-08 00:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0012_youtube_backfill_state"
down_revision: str | None = "0011_artist_archive_terms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if table_name not in tables:
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("youtube_sources")
    if not columns:
        return
    if "backfill_cursor" not in columns:
        op.add_column("youtube_sources", sa.Column("backfill_cursor", sa.String(length=255)))
    if "backfill_status" not in columns:
        op.add_column(
            "youtube_sources",
            sa.Column(
                "backfill_status",
                sa.String(length=20),
                nullable=False,
                server_default="idle",
            ),
        )
    if "backfill_started_at" not in columns:
        op.add_column(
            "youtube_sources",
            sa.Column("backfill_started_at", sa.DateTime(timezone=True)),
        )
    if "backfill_completed_at" not in columns:
        op.add_column(
            "youtube_sources",
            sa.Column("backfill_completed_at", sa.DateTime(timezone=True)),
        )
    if "backfill_error" not in columns:
        op.add_column(
            "youtube_sources",
            sa.Column("backfill_error", sa.Text(), nullable=False, server_default=""),
        )


def downgrade() -> None:
    columns = _columns("youtube_sources")
    for column in [
        "backfill_error",
        "backfill_completed_at",
        "backfill_started_at",
        "backfill_status",
        "backfill_cursor",
    ]:
        if column in columns:
            op.drop_column("youtube_sources", column)
