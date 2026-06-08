"""add auth sessions and email verification

Revision ID: 0015_auth_sessions_email_oauth
Revises: 0014_analytics_events
Create Date: 2026-06-08 22:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0015_auth_sessions_email_oauth"
down_revision: str | None = "0014_analytics_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "email_verified_at" not in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
        op.execute("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL")

    tables = _tables()
    if "user_sessions" not in tables:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
            sa.Column("jti", sa.String(length=80), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="password"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("length(trim(refresh_token_hash)) > 0", name="ck_user_session_refresh_hash"),
            sa.CheckConstraint("length(trim(jti)) > 0", name="ck_user_session_jti"),
            sa.UniqueConstraint("refresh_token_hash", name="uq_user_session_refresh_hash"),
            sa.UniqueConstraint("jti", name="uq_user_session_jti"),
        )
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    if "email_verification_tokens" not in tables:
        op.create_table(
            "email_verification_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("length(trim(token_hash)) > 0", name="ck_email_verification_token_hash"),
            sa.UniqueConstraint("token_hash", name="uq_email_verification_token_hash"),
        )
        op.create_index("ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"])


def downgrade() -> None:
    if "email_verification_tokens" in _tables():
        op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
        op.drop_table("email_verification_tokens")
    if "user_sessions" in _tables():
        op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
        op.drop_table("user_sessions")
    if "email_verified_at" in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("email_verified_at")
