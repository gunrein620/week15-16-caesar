"""expand youtube source types

Revision ID: 0010_youtube_source_types
Revises: 0009_feed_board_embeds
Create Date: 2026-06-08 16:30:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010_youtube_source_types"
down_revision: str | None = "0009_feed_board_embeds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_TYPES = "source_type IN ('official_channel', 'fan_channel', 'curated_video')"
NEW_TYPES = (
    "source_type IN ("
    "'official_channel', "
    "'member_channel', "
    "'fan_channel', "
    "'curated_video', "
    "'keyword_search'"
    ")"
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_constraint("ck_youtube_source_type", "youtube_sources", type_="check")
    op.create_check_constraint("ck_youtube_source_type", "youtube_sources", NEW_TYPES)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_constraint("ck_youtube_source_type", "youtube_sources", type_="check")
    op.create_check_constraint("ck_youtube_source_type", "youtube_sources", OLD_TYPES)
