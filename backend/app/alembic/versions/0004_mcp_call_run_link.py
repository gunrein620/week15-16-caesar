"""link mcp calls to agent runs

Revision ID: 0004_mcp_call_run_link
Revises: 0003_rag_chunk_indexes
Create Date: 2026-06-07 00:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0004_mcp_call_run_link"
down_revision: str | None = "0003_rag_chunk_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_columns = {column["name"] for column in inspect(bind).get_columns("mcp_call_logs")}
    if "agent_run_id" not in existing_columns:
        op.add_column("mcp_call_logs", sa.Column("agent_run_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_mcp_call_logs_agent_run_id",
            "mcp_call_logs",
            "agent_runs",
            ["agent_run_id"],
            ["id"],
            ondelete="CASCADE",
        )
    existing_indexes = {index["name"] for index in inspect(bind).get_indexes("mcp_call_logs")}
    if "ix_mcp_call_logs_agent_run_id" not in existing_indexes:
        op.create_index(
            "ix_mcp_call_logs_agent_run_id",
            "mcp_call_logs",
            ["agent_run_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_mcp_call_logs_agent_run_id", table_name="mcp_call_logs")
    op.drop_constraint("fk_mcp_call_logs_agent_run_id", "mcp_call_logs", type_="foreignkey")
    op.drop_column("mcp_call_logs", "agent_run_id")
