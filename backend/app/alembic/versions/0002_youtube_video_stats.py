"""add youtube video statistics

Revision ID: 0002_youtube_video_stats
Revises: 0001_initial
Create Date: 2026-06-07 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0002_youtube_video_stats"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    existing = {column["name"] for column in inspect(op.get_bind()).get_columns("youtube_videos")}
    if "view_count" not in existing:
        op.add_column("youtube_videos", sa.Column("view_count", sa.Integer(), nullable=True))
    if "like_count" not in existing:
        op.add_column("youtube_videos", sa.Column("like_count", sa.Integer(), nullable=True))
    if "comment_count" not in existing:
        op.add_column("youtube_videos", sa.Column("comment_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("youtube_videos", "comment_count")
    op.drop_column("youtube_videos", "like_count")
    op.drop_column("youtube_videos", "view_count")
