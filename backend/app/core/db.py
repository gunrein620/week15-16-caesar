from collections.abc import Generator
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
        _engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _session_factory


def get_db() -> Generator[Session, None, None]:
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()


def reset_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def is_postgres() -> bool:
    return get_engine().dialect.name == "postgresql"


def _alembic_head() -> str:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    return ScriptDirectory.from_config(config).get_current_head()


def check_db_ready() -> dict[str, bool | str]:
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        if engine.dialect.name != "postgresql":
            return {
                "database": True,
                "pgvector_available": False,
                "pgvector_installed": False,
                "migrations": True,
            }

        available = conn.execute(
            text("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')")
        ).scalar_one()
        installed = conn.execute(
            text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')")
        ).scalar_one()
        has_alembic_table = conn.execute(
            text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')")
        ).scalar_one()
        migration_current = ""
        if has_alembic_table:
            migration_current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar() or ""
        migration_head = _alembic_head()
        migrations = migration_current == migration_head
        return {
            "database": True,
            "pgvector_available": bool(available),
            "pgvector_installed": bool(installed),
            "migrations": bool(migrations),
            "migration_current": migration_current or "",
            "migration_head": migration_head,
        }
