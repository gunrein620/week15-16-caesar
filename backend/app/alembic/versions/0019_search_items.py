"""add unified search item index

Revision ID: 0019_search_items
Revises: 0018_artist_archive_member_terms
Create Date: 2026-06-16 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0019_search_items"
down_revision: str | None = "0018_artist_archive_member_terms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(length=40), nullable=False),
        sa.Column("source_type", sa.String(length=60), nullable=False),
        sa.Column("source_value", sa.String(length=500), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("original_youtube_source_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["original_youtube_source_id"], ["youtube_sources.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "platform",
            "source_type",
            "source_value",
            "artist_id",
            name="uq_content_source_identity",
        ),
        sa.UniqueConstraint("original_youtube_source_id", name="uq_content_source_youtube_source"),
        sa.CheckConstraint("length(trim(platform)) > 0", name="ck_content_source_platform"),
        sa.CheckConstraint("length(trim(source_type)) > 0", name="ck_content_source_type"),
        sa.CheckConstraint("length(trim(source_value)) > 0", name="ck_content_source_value"),
    )
    op.create_index("ix_content_sources_artist_id", "content_sources", ["artist_id"])
    op.create_index("ix_content_sources_original_youtube_source_id", "content_sources", ["original_youtube_source_id"])
    op.create_index("ix_content_sources_source_type", "content_sources", ["source_type"])

    op.create_table(
        "search_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=40), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=True),
        sa.Column("youtube_video_id", sa.String(length=32), nullable=True),
        sa.Column("external_update_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=False, server_default=""),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=True),
        sa.Column("like_count", sa.Integer(), nullable=True),
        sa.Column("comment_count", sa.Integer(), nullable=True),
        sa.Column("has_transcript", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["youtube_video_id"], ["youtube_videos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["external_update_id"], ["external_updates.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("post_id", name="uq_search_item_post"),
        sa.UniqueConstraint("youtube_video_id", name="uq_search_item_youtube_video"),
        sa.UniqueConstraint("external_update_id", name="uq_search_item_external_update"),
        sa.CheckConstraint(
            "item_type IN ('youtube', 'post', 'briefing', 'naver_news', 'naver_blog')",
            name="ck_search_item_type",
        ),
        sa.CheckConstraint(
            "(post_id IS NOT NULL AND youtube_video_id IS NULL AND external_update_id IS NULL) OR "
            "(post_id IS NULL AND youtube_video_id IS NOT NULL AND external_update_id IS NULL) OR "
            "(post_id IS NULL AND youtube_video_id IS NULL AND external_update_id IS NOT NULL)",
            name="ck_search_item_exactly_one_source",
        ),
    )
    op.create_index("ix_search_items_artist_id", "search_items", ["artist_id"])
    op.create_index(
        "ix_search_items_artist_type_published",
        "search_items",
        ["artist_id", "item_type", "published_at"],
    )
    op.create_index(
        "ix_search_items_artist_published",
        "search_items",
        ["artist_id", "published_at"],
    )
    op.create_index("ix_search_items_post_id", "search_items", ["post_id"])
    op.create_index("ix_search_items_youtube_video_id", "search_items", ["youtube_video_id"])
    op.create_index("ix_search_items_external_update_id", "search_items", ["external_update_id"])

    op.create_table(
        "search_item_sources",
        sa.Column("search_item_id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("source_id", sa.Integer(), nullable=False, primary_key=True),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["content_sources.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_search_item_sources_source", "search_item_sources", ["source_id"])

    op.create_table(
        "search_item_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("search_item_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("member_name", sa.String(length=80), nullable=False),
        sa.Column("evidence_type", sa.String(length=20), nullable=False),
        sa.Column("evidence_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "search_item_id", "member_id", "evidence_type", name="uq_search_item_member"
        ),
        sa.CheckConstraint(
            "evidence_type IN ('title', 'description', 'thumbnail', 'transcript', 'manual')",
            name="ck_search_item_member_evidence_type",
        ),
    )
    op.create_index("ix_search_item_members_search_item_id", "search_item_members", ["search_item_id"])
    op.create_index("ix_search_item_members_member_id", "search_item_members", ["member_id"])
    op.create_index("ix_search_item_members_member", "search_item_members", ["member_id"])

    op.create_table(
        "search_item_terms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("search_item_id", sa.Integer(), nullable=False),
        sa.Column("archive_term_id", sa.Integer(), nullable=False),
        sa.Column("term_title", sa.String(length=160), nullable=False),
        sa.Column("evidence_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["search_item_id"], ["search_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["archive_term_id"], ["artist_archive_terms.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "search_item_id", "archive_term_id", name="uq_search_item_archive_term"
        ),
    )
    op.create_index("ix_search_item_terms_search_item_id", "search_item_terms", ["search_item_id"])
    op.create_index("ix_search_item_terms_archive_term_id", "search_item_terms", ["archive_term_id"])
    op.create_index("ix_search_item_terms_archive_term", "search_item_terms", ["archive_term_id"])

    with op.batch_alter_table("rag_chunks") as batch_op:
        batch_op.add_column(sa.Column("search_item_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("chunk_type", sa.String(length=40), nullable=False, server_default="metadata")
        )
        batch_op.add_column(sa.Column("start_seconds", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("end_seconds", sa.Float(), nullable=True))
        batch_op.create_foreign_key(
            "fk_rag_chunks_search_item_id_search_items",
            "search_items",
            ["search_item_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_rag_chunks_search_item_id", ["search_item_id"])


def downgrade() -> None:
    with op.batch_alter_table("rag_chunks") as batch_op:
        batch_op.drop_index("ix_rag_chunks_search_item_id")
        batch_op.drop_constraint("fk_rag_chunks_search_item_id_search_items", type_="foreignkey")
        batch_op.drop_column("end_seconds")
        batch_op.drop_column("start_seconds")
        batch_op.drop_column("chunk_type")
        batch_op.drop_column("search_item_id")

    op.drop_table("search_item_terms")
    op.drop_table("search_item_members")
    op.drop_table("search_item_sources")
    op.drop_table("search_items")
    op.drop_table("content_sources")
