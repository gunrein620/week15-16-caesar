from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import admin, agent, ai, artists, auth, posts
from app.core.config import get_settings
from app.core.db import check_db_ready, get_engine, get_session_factory
from app.core.rate_limit import limiter
from app.services.infra_budget import infra_hard_stop_active


def _infra_budget_safe_path(path: str) -> bool:
    return (
        path in {"/health", "/ready", "/auth/login", "/auth/me", "/auth/signup-status"}
        or path.startswith("/admin/settings/infra-cost")
    )


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.state.limiter = limiter
    app.add_exception_handler(
        RateLimitExceeded,
        lambda request, exc: JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"}),
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_origin_regex=settings.cors_allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def infra_budget_hard_stop(request, call_next):
        if request.method == "OPTIONS" or _infra_budget_safe_path(request.url.path):
            return await call_next(request)
        try:
            with get_session_factory()() as db:
                if infra_hard_stop_active(db):
                    return JSONResponse(
                        status_code=503,
                        content={"detail": "Infrastructure budget hard stop"},
                    )
        except Exception:
            return await call_next(request)
        return await call_next(request)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    def ready() -> JSONResponse:
        state = check_db_ready()
        postgres_needs_vector = get_engine().dialect.name == "postgresql"
        is_ready = bool(state["database"] and state["migrations"])
        if postgres_needs_vector:
            is_ready = is_ready and bool(state["pgvector_available"] and state["pgvector_installed"])
        status_code = 200 if is_ready else 503
        return JSONResponse(status_code=status_code, content={"ready": is_ready, **state})

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(posts.router)
    app.include_router(ai.router)
    app.include_router(artists.router)
    app.include_router(agent.router)
    return app


app = create_app()
