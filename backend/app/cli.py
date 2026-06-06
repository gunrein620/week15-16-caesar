import typer

from app.core.db import get_session_factory
from app.services.seed import ensure_admin_user, ensure_minimal_rag_seed

cli = typer.Typer()


@cli.command()
def seed_admin() -> None:
    with get_session_factory()() as db:
        user = ensure_admin_user(db)
        db.commit()
        typer.echo(f"admin ready: {user.email}")


@cli.command()
def seed_demo() -> None:
    with get_session_factory()() as db:
        ensure_minimal_rag_seed(db)
        typer.echo("demo seed ready")


if __name__ == "__main__":
    cli()
