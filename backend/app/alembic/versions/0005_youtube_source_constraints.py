"""add youtube source constraints

Revision ID: 0005_youtube_source_constraints
Revises: 0004_mcp_call_run_link
Create Date: 2026-06-07 00:30:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_youtube_source_constraints"
down_revision: str | None = "0004_mcp_call_run_link"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.create_check_constraint(
        "ck_youtube_source_type",
        "youtube_sources",
        "source_type IN ('official_channel', 'fan_channel', 'curated_video')",
    )
    op.create_check_constraint(
        "ck_youtube_source_value",
        "youtube_sources",
        "length(trim(source_value)) > 0",
    )
    op.create_check_constraint(
        "ck_youtube_source_title",
        "youtube_sources",
        "length(trim(title)) > 0",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_constraint("ck_youtube_source_title", "youtube_sources", type_="check")
    op.drop_constraint("ck_youtube_source_value", "youtube_sources", type_="check")
    op.drop_constraint("ck_youtube_source_type", "youtube_sources", type_="check")
