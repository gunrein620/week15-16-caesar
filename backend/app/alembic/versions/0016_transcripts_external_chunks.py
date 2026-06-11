"""add transcripts and external rag chunks

Revision ID: 0016_transcripts_external_chunks
Revises: 0015_auth_sessions_email_oauth
Create Date: 2026-06-11 22:10:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0016_transcripts_external_chunks"
down_revision: str | None = "0015_auth_sessions_email_oauth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SOURCE_CHECK = (
    "(post_id IS NOT NULL AND youtube_video_id IS NULL AND external_update_id IS NULL) OR "
    "(post_id IS NULL AND youtube_video_id IS NOT NULL AND external_update_id IS NULL) OR "
    "(post_id IS NULL AND youtube_video_id IS NULL AND external_update_id IS NOT NULL)"
)
LEGACY_SOURCE_CHECK = (
    "(post_id IS NOT NULL AND youtube_video_id IS NULL) OR "
    "(post_id IS NULL AND youtube_video_id IS NOT NULL)"
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _tables() -> set[str]:
    return set(_inspector().get_table_names())


def _columns(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {column["name"] for column in _inspector().get_columns(table)}


def _indexes(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {index["name"] for index in _inspector().get_indexes(table)}


def _foreign_keys(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {fk["name"] for fk in _inspector().get_foreign_keys(table) if fk["name"]}


def _check_constraints(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {check["name"] for check in _inspector().get_check_constraints(table) if check["name"]}


def _drop_rag_source_check() -> None:
    if "ck_rag_chunk_exactly_one_source" not in _check_constraints("rag_chunks"):
        return
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("rag_chunks") as batch_op:
            batch_op.drop_constraint("ck_rag_chunk_exactly_one_source", type_="check")
        return
    op.drop_constraint("ck_rag_chunk_exactly_one_source", "rag_chunks", type_="check")


def _create_rag_source_check(sqltext: str) -> None:
    if "ck_rag_chunk_exactly_one_source" in _check_constraints("rag_chunks"):
        return
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("rag_chunks") as batch_op:
            batch_op.create_check_constraint("ck_rag_chunk_exactly_one_source", sqltext)
        return
    op.create_check_constraint("ck_rag_chunk_exactly_one_source", "rag_chunks", sqltext)


def upgrade() -> None:
    if "youtube_videos" in _tables():
        youtube_columns = _columns("youtube_videos")
        if "transcript_status" not in youtube_columns:
            op.add_column(
                "youtube_videos",
                sa.Column(
                    "transcript_status",
                    sa.String(length=20),
                    nullable=False,
                    server_default="pending",
                ),
            )
        if "transcript_fetched_at" not in youtube_columns:
            op.add_column(
                "youtube_videos",
                sa.Column("transcript_fetched_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "transcript_lang" not in youtube_columns:
            op.add_column(
                "youtube_videos",
                sa.Column(
                    "transcript_lang",
                    sa.String(length=16),
                    nullable=False,
                    server_default="",
                ),
            )

    if "rag_chunks" not in _tables():
        return

    rag_columns = _columns("rag_chunks")
    if "external_update_id" not in rag_columns:
        op.add_column("rag_chunks", sa.Column("external_update_id", sa.Integer(), nullable=True))

    if (
        "external_updates" in _tables()
        and "fk_rag_chunks_external_update_id_external_updates" not in _foreign_keys("rag_chunks")
    ):
        op.create_foreign_key(
            "fk_rag_chunks_external_update_id_external_updates",
            "rag_chunks",
            "external_updates",
            ["external_update_id"],
            ["id"],
            ondelete="CASCADE",
        )

    existing_indexes = _indexes("rag_chunks")
    if "ix_rag_chunks_external_update_id" not in existing_indexes:
        op.create_index("ix_rag_chunks_external_update_id", "rag_chunks", ["external_update_id"])
    if "ux_rag_chunk_external_index" not in existing_indexes:
        op.create_index(
            "ux_rag_chunk_external_index",
            "rag_chunks",
            ["external_update_id", "chunk_index"],
            unique=True,
            postgresql_where=sa.text("external_update_id IS NOT NULL"),
            sqlite_where=sa.text("external_update_id IS NOT NULL"),
        )

    _drop_rag_source_check()
    _create_rag_source_check(SOURCE_CHECK)


def downgrade() -> None:
    if "rag_chunks" in _tables():
        _drop_rag_source_check()
        _create_rag_source_check(LEGACY_SOURCE_CHECK)

        existing_indexes = _indexes("rag_chunks")
        if "ux_rag_chunk_external_index" in existing_indexes:
            op.drop_index("ux_rag_chunk_external_index", table_name="rag_chunks")
        if "ix_rag_chunks_external_update_id" in existing_indexes:
            op.drop_index("ix_rag_chunks_external_update_id", table_name="rag_chunks")
        if "fk_rag_chunks_external_update_id_external_updates" in _foreign_keys("rag_chunks"):
            op.drop_constraint(
                "fk_rag_chunks_external_update_id_external_updates",
                "rag_chunks",
                type_="foreignkey",
            )
        if "external_update_id" in _columns("rag_chunks"):
            op.drop_column("rag_chunks", "external_update_id")

    if "youtube_videos" in _tables():
        youtube_columns = _columns("youtube_videos")
        for column in ["transcript_lang", "transcript_fetched_at", "transcript_status"]:
            if column in youtube_columns:
                op.drop_column("youtube_videos", column)
