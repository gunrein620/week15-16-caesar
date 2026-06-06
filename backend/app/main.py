from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import agent, ai, artists, auth, posts
from app.core.config import get_settings
from app.core.db import check_db_ready, get_engine
from app.core.rate_limit import limiter


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
    app.include_router(posts.router)
    app.include_router(ai.router)
    app.include_router(artists.router)
    app.include_router(agent.router)
    return app


app = create_app()
