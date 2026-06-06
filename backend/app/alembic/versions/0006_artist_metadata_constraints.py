"""add artist metadata constraints

Revision ID: 0006_artist_metadata_constraints
Revises: 0005_youtube_source_constraints
Create Date: 2026-06-07 00:40:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect

revision: str = "0006_artist_metadata_constraints"
down_revision: str | None = "0005_youtube_source_constraints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _constraint_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {
        item["name"]
        for item in [
            *inspector.get_check_constraints(table_name),
            *inspector.get_unique_constraints(table_name),
        ]
        if item.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        """
        DELETE FROM members existing
        USING members duplicate
        WHERE existing.artist_id = duplicate.artist_id
          AND existing.name = duplicate.name
          AND existing.id > duplicate.id
        """
    )

    member_constraints = _constraint_names("members")
    if "uq_member_artist_name" not in member_constraints:
        op.create_unique_constraint("uq_member_artist_name", "members", ["artist_id", "name"])
    if "ck_member_name" not in member_constraints:
        op.create_check_constraint("ck_member_name", "members", "length(trim(name)) > 0")

    keyword_constraints = _constraint_names("artist_keywords")
    if "ck_artist_keyword" not in keyword_constraints:
        op.create_check_constraint(
            "ck_artist_keyword", "artist_keywords", "length(trim(keyword)) > 0"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_constraint("ck_artist_keyword", "artist_keywords", type_="check")
    op.drop_constraint("ck_member_name", "members", type_="check")
    op.drop_constraint("uq_member_artist_name", "members", type_="unique")
