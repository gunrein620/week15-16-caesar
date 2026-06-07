"""add artist archive search terms

Revision ID: 0011_artist_archive_terms
Revises: 0010_youtube_source_types
Create Date: 2026-06-07 18:45:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0011_artist_archive_terms"
down_revision: str | None = "0010_youtube_source_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "artist_archive_terms" in tables:
        return
    op.create_table(
        "artist_archive_terms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("term_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "term_type IN ('song', 'album', 'activity')",
            name="ck_artist_archive_term_type",
        ),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_artist_archive_term_title"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("artist_id", "term_type", "title", name="uq_artist_archive_term"),
    )
    op.create_index("ix_artist_archive_terms_artist_id", "artist_archive_terms", ["artist_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "artist_archive_terms" not in tables:
        return
    op.drop_index("ix_artist_archive_terms_artist_id", table_name="artist_archive_terms")
    op.drop_table("artist_archive_terms")
