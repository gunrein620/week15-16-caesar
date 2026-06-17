"""add youtube thumbnail analysis cache

Revision ID: 0017_youtube_thumbnail_analysis
Revises: 0016_transcripts_external_chunks
Create Date: 2026-06-15 23:40:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0017_youtube_thumbnail_analysis"
down_revision: str | None = "0016_transcripts_external_chunks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table not in set(inspector.get_table_names()):
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    youtube_columns = _columns("youtube_videos")
    if not youtube_columns:
        return
    if "thumbnail_analysis_status" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column(
                "thumbnail_analysis_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            ),
        )
    if "thumbnail_analyzed_at" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column("thumbnail_analyzed_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "thumbnail_analysis_model" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column(
                "thumbnail_analysis_model",
                sa.String(length=80),
                nullable=False,
                server_default="",
            ),
        )
    if "thumbnail_analysis_error" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column("thumbnail_analysis_error", sa.Text(), nullable=False, server_default=""),
        )
    if "thumbnail_detected_members" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column("thumbnail_detected_members", sa.Text(), nullable=False, server_default="[]"),
        )
    if "thumbnail_person_count" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column("thumbnail_person_count", sa.Integer(), nullable=True),
        )
    if "thumbnail_analysis_confidence" not in youtube_columns:
        op.add_column(
            "youtube_videos",
            sa.Column("thumbnail_analysis_confidence", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    youtube_columns = _columns("youtube_videos")
    for column in (
        "thumbnail_analysis_confidence",
        "thumbnail_person_count",
        "thumbnail_detected_members",
        "thumbnail_analysis_error",
        "thumbnail_analysis_model",
        "thumbnail_analyzed_at",
        "thumbnail_analysis_status",
    ):
        if column in youtube_columns:
            op.drop_column("youtube_videos", column)
