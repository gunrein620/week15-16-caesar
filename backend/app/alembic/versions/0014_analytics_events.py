"""add analytics events

Revision ID: 0014_analytics_events
Revises: 0013_rag_embedding_jobs
Create Date: 2026-06-08 21:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0014_analytics_events"
down_revision: str | None = "0013_rag_embedding_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "analytics_events" in _tables():
        return
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_name", sa.String(length=80), nullable=False),
        sa.Column("anonymous_session_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("path", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("panel", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("source", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(event_name)) > 0", name="ck_analytics_event_name"),
        sa.CheckConstraint(
            "length(trim(anonymous_session_id)) > 0",
            name="ck_analytics_anonymous_session",
        ),
    )
    op.create_index("ix_analytics_events_anonymous_session_id", "analytics_events", ["anonymous_session_id"])
    op.create_index("ix_analytics_events_created_at", "analytics_events", ["created_at"])
    op.create_index("ix_analytics_events_event_created", "analytics_events", ["event_name", "created_at"])
    op.create_index("ix_analytics_events_event_name", "analytics_events", ["event_name"])
    op.create_index("ix_analytics_events_user_id", "analytics_events", ["user_id"])


def downgrade() -> None:
    if "analytics_events" not in _tables():
        return
    op.drop_index("ix_analytics_events_user_id", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event_name", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_created_at", table_name="analytics_events")
    op.drop_index("ix_analytics_events_anonymous_session_id", table_name="analytics_events")
    op.drop_table("analytics_events")
