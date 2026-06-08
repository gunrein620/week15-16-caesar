"""add rag embedding jobs

Revision ID: 0013_rag_embedding_jobs
Revises: 0012_youtube_backfill_state
Create Date: 2026-06-08 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0013_rag_embedding_jobs"
down_revision: str | None = "0012_youtube_backfill_state"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "rag_embedding_jobs" in _tables():
        return
    op.create_table(
        "rag_embedding_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("artist_id", sa.Integer(), sa.ForeignKey("artists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=True),
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default="64"),
        sa.Column("force", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("total_videos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_candidates", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remaining_missing", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("scope IN ('recent_90d', 'all')", name="ck_rag_embedding_job_scope"),
        sa.CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_rag_embedding_job_status",
        ),
    )
    op.create_index("ix_rag_embedding_jobs_artist_id", "rag_embedding_jobs", ["artist_id"])
    op.create_index("ix_rag_embedding_jobs_user_id", "rag_embedding_jobs", ["user_id"])


def downgrade() -> None:
    if "rag_embedding_jobs" not in _tables():
        return
    op.drop_index("ix_rag_embedding_jobs_user_id", table_name="rag_embedding_jobs")
    op.drop_index("ix_rag_embedding_jobs_artist_id", table_name="rag_embedding_jobs")
    op.drop_table("rag_embedding_jobs")
