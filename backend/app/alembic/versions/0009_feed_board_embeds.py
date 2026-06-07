"""add feed cache, post embeds, and saved items

Revision ID: 0009_feed_board_embeds
Revises: 0008_auth_social_lock
Create Date: 2026-06-08 01:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0009_feed_board_embeds"
down_revision: str | None = "0008_auth_social_lock"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "posts" in tables:
        post_columns = _columns("posts")
        with op.batch_alter_table("posts") as batch_op:
            if "category" not in post_columns:
                batch_op.add_column(
                    sa.Column(
                        "category",
                        sa.String(length=40),
                        nullable=False,
                        server_default="자유",
                    )
                )
            if "thumbnail_url" not in post_columns:
                batch_op.add_column(
                    sa.Column(
                        "thumbnail_url",
                        sa.String(length=500),
                        nullable=False,
                        server_default="",
                    )
                )
            if "embeds" not in post_columns:
                batch_op.add_column(
                    sa.Column("embeds", sa.JSON(), nullable=False, server_default=sa.text("'[]'"))
                )

    if "external_updates" not in tables:
        op.create_table(
            "external_updates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("artist_id", sa.Integer(), nullable=False),
            sa.Column("source_type", sa.String(length=40), nullable=False),
            sa.Column("external_id", sa.String(length=500), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("url", sa.String(length=1000), nullable=False),
            sa.Column("thumbnail_url", sa.String(length=1000), nullable=False, server_default=""),
            sa.Column("source_label", sa.String(length=120), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("content_hash", sa.String(length=64), nullable=False),
            sa.Column("raw_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
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
            sa.CheckConstraint(
                "source_type IN ('naver_news', 'naver_blog')",
                name="ck_external_update_source_type",
            ),
            sa.CheckConstraint(
                "length(trim(external_id)) > 0",
                name="ck_external_update_external_id",
            ),
            sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
            sa.UniqueConstraint(
                "artist_id", "source_type", "external_id", name="uq_external_update_source"
            ),
        )
        op.create_index("ix_external_updates_artist_id", "external_updates", ["artist_id"])
        op.create_index(
            "ix_external_updates_artist_published",
            "external_updates",
            ["artist_id", "published_at"],
        )

    if "saved_items" not in tables:
        op.create_table(
            "saved_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("item_type", sa.String(length=40), nullable=False),
            sa.Column("item_key", sa.String(length=500), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("url", sa.String(length=1000), nullable=False, server_default=""),
            sa.Column("thumbnail_url", sa.String(length=1000), nullable=False, server_default=""),
            sa.Column("source_label", sa.String(length=120), nullable=False, server_default=""),
            sa.Column(
                "saved_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
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
            sa.CheckConstraint("length(trim(item_type)) > 0", name="ck_saved_item_type"),
            sa.CheckConstraint("length(trim(item_key)) > 0", name="ck_saved_item_key"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "item_type", "item_key", name="uq_saved_item_user_target"),
        )
        op.create_index("ix_saved_items_user_id", "saved_items", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "saved_items" in tables:
        op.drop_index("ix_saved_items_user_id", table_name="saved_items")
        op.drop_table("saved_items")
    if "external_updates" in tables:
        op.drop_index("ix_external_updates_artist_published", table_name="external_updates")
        op.drop_index("ix_external_updates_artist_id", table_name="external_updates")
        op.drop_table("external_updates")
    if "posts" in tables:
        post_columns = _columns("posts")
        with op.batch_alter_table("posts") as batch_op:
            if "embeds" in post_columns:
                batch_op.drop_column("embeds")
            if "thumbnail_url" in post_columns:
                batch_op.drop_column("thumbnail_url")
            if "category" in post_columns:
                batch_op.drop_column("category")
