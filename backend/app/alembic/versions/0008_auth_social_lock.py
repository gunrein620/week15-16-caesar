"""add auth lockout and social identity support

Revision ID: 0008_auth_social_lock
Revises: 0007_app_settings
Create Date: 2026-06-08 00:20:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0008_auth_social_lock"
down_revision: str | None = "0007_app_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "auth_identities" not in tables:
        op.create_table(
            "auth_identities",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("provider_subject", sa.String(length=255), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
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
            sa.CheckConstraint("length(trim(provider)) > 0", name="ck_auth_identity_provider"),
            sa.CheckConstraint(
                "length(trim(provider_subject)) > 0", name="ck_auth_identity_subject"
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint(
                "provider", "provider_subject", name="uq_auth_identity_provider_subject"
            ),
            sa.UniqueConstraint("provider", "user_id", name="uq_auth_identity_provider_user"),
        )
        op.create_index("ix_auth_identities_user_id", "auth_identities", ["user_id"])

    if "auth_login_attempts" not in tables:
        op.create_table(
            "auth_login_attempts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("identifier", sa.String(length=320), nullable=False),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
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
            sa.UniqueConstraint("identifier", name="uq_auth_login_attempt_identifier"),
        )
        op.create_index("ix_auth_login_attempts_identifier", "auth_login_attempts", ["identifier"])

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(length=255),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(length=255),
            nullable=False,
        )
    op.drop_index("ix_auth_login_attempts_identifier", table_name="auth_login_attempts")
    op.drop_table("auth_login_attempts")
    op.drop_index("ix_auth_identities_user_id", table_name="auth_identities")
    op.drop_table("auth_identities")
