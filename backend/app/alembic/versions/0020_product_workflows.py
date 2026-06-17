"""add product workflow tables

Revision ID: 0020_product_workflows
Revises: 0019_search_items
Create Date: 2026-06-16 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0020_product_workflows"
down_revision: str | None = "0019_search_items"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("content_types", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("source_types", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("member_names", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("archive_term_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_user_subscription_name"),
    )
    op.create_index("ix_user_subscriptions_user_id", "user_subscriptions", ["user_id"])
    op.create_index("ix_user_subscriptions_artist_id", "user_subscriptions", ["artist_id"])
    op.create_index(
        "ix_user_subscriptions_user_artist",
        "user_subscriptions",
        ["user_id", "artist_id"],
    )
    op.create_index(
        "ix_user_subscriptions_artist_enabled",
        "user_subscriptions",
        ["artist_id", "enabled"],
    )

    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=True),
        sa.Column("search_item_id", sa.Integer(), nullable=False),
        sa.Column(
            "notification_type",
            sa.String(length=40),
            nullable=False,
            server_default="subscription_match",
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["user_subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id",
            "subscription_id",
            "search_item_id",
            "notification_type",
            name="uq_user_notification_target",
        ),
        sa.CheckConstraint(
            "length(trim(notification_type)) > 0", name="ck_user_notification_type"
        ),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_user_notification_title"),
    )
    op.create_index("ix_user_notifications_user_id", "user_notifications", ["user_id"])
    op.create_index("ix_user_notifications_artist_id", "user_notifications", ["artist_id"])
    op.create_index(
        "ix_user_notifications_subscription_id",
        "user_notifications",
        ["subscription_id"],
    )
    op.create_index("ix_user_notifications_search_item_id", "user_notifications", ["search_item_id"])
    op.create_index(
        "ix_user_notifications_user_read",
        "user_notifications",
        ["user_id", "read_at", "created_at"],
    )
    op.create_index(
        "ix_user_notifications_artist_created",
        "user_notifications",
        ["artist_id", "created_at"],
    )

    op.create_table(
        "collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="private"),
        sa.Column("ai_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_collection_title"),
        sa.CheckConstraint("visibility IN ('private')", name="ck_collection_visibility"),
    )
    op.create_index("ix_collections_user_id", "collections", ["user_id"])
    op.create_index("ix_collections_artist_id", "collections", ["artist_id"])
    op.create_index("ix_collections_user_artist", "collections", ["user_id", "artist_id"])

    op.create_table(
        "collection_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("collection_id", sa.Integer(), nullable=False),
        sa.Column("search_item_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("source_type", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("collection_id", "search_item_id", name="uq_collection_item_target"),
    )
    op.create_index("ix_collection_items_collection_id", "collection_items", ["collection_id"])
    op.create_index("ix_collection_items_search_item_id", "collection_items", ["search_item_id"])
    op.create_index(
        "ix_collection_items_collection_position",
        "collection_items",
        ["collection_id", "position"],
    )
    op.create_index("ix_collection_items_search_item", "collection_items", ["search_item_id"])

    op.create_table(
        "data_quality_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("search_item_id", sa.Integer(), nullable=False),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("search_item_id", "task_type", name="uq_data_quality_task_target"),
        sa.CheckConstraint(
            "task_type IN ('embedding_missing', 'transcript_pending', 'thumbnail_pending', 'source_missing')",
            name="ck_data_quality_task_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'resolved', 'failed', 'skipped')",
            name="ck_data_quality_task_status",
        ),
    )
    op.create_index("ix_data_quality_tasks_artist_id", "data_quality_tasks", ["artist_id"])
    op.create_index("ix_data_quality_tasks_search_item_id", "data_quality_tasks", ["search_item_id"])
    op.create_index(
        "ix_data_quality_tasks_artist_status",
        "data_quality_tasks",
        ["artist_id", "status", "priority"],
    )
    op.create_index(
        "ix_data_quality_tasks_search_item",
        "data_quality_tasks",
        ["search_item_id"],
    )


def downgrade() -> None:
    op.drop_table("data_quality_tasks")
    op.drop_table("collection_items")
    op.drop_table("collections")
    op.drop_table("user_notifications")
    op.drop_table("user_subscriptions")
