"""allow member archive search terms

Revision ID: 0018_artist_archive_member_terms
Revises: 0017_youtube_thumbnail_analysis
Create Date: 2026-06-15 23:55:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0018_artist_archive_member_terms"
down_revision: str | None = "0017_youtube_thumbnail_analysis"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLE = "artist_archive_terms"
CONSTRAINT = "ck_artist_archive_term_type"
OLD_TYPES = "'song', 'album', 'activity'"
NEW_TYPES = "'song', 'album', 'activity', 'member'"


def _table_exists() -> bool:
    return TABLE in set(sa.inspect(op.get_bind()).get_table_names())


def _check_constraint_exists() -> bool:
    checks = sa.inspect(op.get_bind()).get_check_constraints(TABLE)
    return any(check.get("name") == CONSTRAINT for check in checks)


def _replace_check_constraint(types: str) -> None:
    if not _table_exists():
        return
    constraint_exists = _check_constraint_exists()
    with op.batch_alter_table(TABLE, recreate="always") as batch_op:
        if constraint_exists:
            batch_op.drop_constraint(CONSTRAINT, type_="check")
        batch_op.create_check_constraint(CONSTRAINT, f"term_type IN ({types})")


def upgrade() -> None:
    _replace_check_constraint(NEW_TYPES)


def downgrade() -> None:
    _replace_check_constraint(OLD_TYPES)
