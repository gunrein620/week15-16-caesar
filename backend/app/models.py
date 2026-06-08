from datetime import date, datetime
from typing import Any, Literal

from sqlalchemy import (
    CheckConstraint,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.types import EmbeddingVector

UserRole = Literal["user", "admin"]
YoutubeSourceType = Literal[
    "official_channel",
    "member_channel",
    "fan_channel",
    "curated_video",
    "keyword_search",
]
ArchiveTermType = Literal["song", "album", "activity"]


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AppSetting(Base, TimestampMixin):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author")
    saved_items: Mapped[list["SavedItem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    auth_identities: Mapped[list["AuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user")


class AuthIdentity(Base, TimestampMixin):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_auth_identity_provider_subject"),
        UniqueConstraint("provider", "user_id", name="uq_auth_identity_provider_user"),
        CheckConstraint("length(trim(provider)) > 0", name="ck_auth_identity_provider"),
        CheckConstraint("length(trim(provider_subject)) > 0", name="ck_auth_identity_subject"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship(back_populates="auth_identities")


class AuthLoginAttempt(Base, TimestampMixin):
    __tablename__ = "auth_login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    identifier: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        UniqueConstraint("refresh_token_hash", name="uq_user_session_refresh_hash"),
        UniqueConstraint("jti", name="uq_user_session_jti"),
        CheckConstraint("length(trim(refresh_token_hash)) > 0", name="ck_user_session_refresh_hash"),
        CheckConstraint("length(trim(jti)) > 0", name="ck_user_session_jti"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    jti: Mapped[str] = mapped_column(String(80), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), default="password", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User | None] = relationship(back_populates="sessions")


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_email_verification_token_hash"),
        CheckConstraint("length(trim(token_hash)) > 0", name="ck_email_verification_token_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Artist(Base, TimestampMixin):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)

    posts: Mapped[list["Post"]] = relationship(back_populates="artist")
    external_updates: Mapped[list["ExternalUpdate"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan"
    )
    members: Mapped[list["Member"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan"
    )
    keywords: Mapped[list["ArtistKeyword"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan"
    )
    archive_terms: Mapped[list["ArtistArchiveTerm"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan"
    )


class Member(Base, TimestampMixin):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("artist_id", "name", name="uq_member_artist_name"),
        CheckConstraint("length(trim(name)) > 0", name="ck_member_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    position: Mapped[str] = mapped_column(String(80), default="", nullable=False)

    artist: Mapped[Artist] = relationship(back_populates="members")


class ArtistKeyword(Base, TimestampMixin):
    __tablename__ = "artist_keywords"
    __table_args__ = (
        UniqueConstraint("artist_id", "keyword", name="uq_artist_keyword"),
        CheckConstraint("length(trim(keyword)) > 0", name="ck_artist_keyword"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    keyword: Mapped[str] = mapped_column(String(120), nullable=False)

    artist: Mapped[Artist] = relationship(back_populates="keywords")


class ArtistArchiveTerm(Base, TimestampMixin):
    __tablename__ = "artist_archive_terms"
    __table_args__ = (
        UniqueConstraint("artist_id", "term_type", "title", name="uq_artist_archive_term"),
        CheckConstraint(
            "term_type IN ('song', 'album', 'activity')",
            name="ck_artist_archive_term_type",
        ),
        CheckConstraint("length(trim(title)) > 0", name="ck_artist_archive_term_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    term_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    artist: Mapped[Artist] = relationship(back_populates="archive_terms")


class Post(Base, TimestampMixin):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(40), default="자유", nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    embeds: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)

    author: Mapped[User] = relationship(back_populates="posts")
    artist: Mapped[Artist] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    tags: Mapped[list["PostTag"]] = relationship(back_populates="post", cascade="all, delete-orphan")
    rag_chunks: Mapped[list["RagChunk"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )


class ExternalUpdate(Base, TimestampMixin):
    __tablename__ = "external_updates"
    __table_args__ = (
        UniqueConstraint("artist_id", "source_type", "external_id", name="uq_external_update_source"),
        CheckConstraint(
            "source_type IN ('naver_news', 'naver_blog')",
            name="ck_external_update_source_type",
        ),
        CheckConstraint("length(trim(external_id)) > 0", name="ck_external_update_external_id"),
        Index("ix_external_updates_artist_published", "artist_id", "published_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    source_label: Mapped[str] = mapped_column(String(120), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    artist: Mapped[Artist] = relationship(back_populates="external_updates")


class SavedItem(Base, TimestampMixin):
    __tablename__ = "saved_items"
    __table_args__ = (
        UniqueConstraint("user_id", "item_type", "item_key", name="uq_saved_item_user_target"),
        CheckConstraint("length(trim(item_type)) > 0", name="ck_saved_item_type"),
        CheckConstraint("length(trim(item_key)) > 0", name="ck_saved_item_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_type: Mapped[str] = mapped_column(String(40), nullable=False)
    item_key: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    source_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="saved_items")


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    post: Mapped[Post] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(back_populates="comments")


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)

    posts: Mapped[list["PostTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class PostTag(Base):
    __tablename__ = "post_tags"
    __table_args__ = (UniqueConstraint("post_id", "tag_id", name="uq_post_tag"),)

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    post: Mapped[Post] = relationship(back_populates="tags")
    tag: Mapped[Tag] = relationship(back_populates="posts")


class YoutubeSource(Base, TimestampMixin):
    __tablename__ = "youtube_sources"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('official_channel', 'member_channel', 'fan_channel', 'curated_video', 'keyword_search')",
            name="ck_youtube_source_type",
        ),
        CheckConstraint("length(trim(source_value)) > 0", name="ck_youtube_source_value"),
        CheckConstraint("length(trim(title)) > 0", name="ck_youtube_source_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_value: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backfill_cursor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    backfill_status: Mapped[str] = mapped_column(String(20), default="idle", nullable=False)
    backfill_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    backfill_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    backfill_error: Mapped[str] = mapped_column(Text, default="", nullable=False)

    videos: Mapped[list["YoutubeVideoSource"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class YoutubeVideo(Base, TimestampMixin):
    __tablename__ = "youtube_videos"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    channel_title: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    thumbnail_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    view_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    like_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    sources: Mapped[list["YoutubeVideoSource"]] = relationship(
        back_populates="video", cascade="all, delete-orphan"
    )
    rag_chunks: Mapped[list["RagChunk"]] = relationship(
        back_populates="youtube_video", cascade="all, delete-orphan"
    )


class YoutubeVideoSource(Base):
    __tablename__ = "youtube_video_sources"

    video_id: Mapped[str] = mapped_column(
        ForeignKey("youtube_videos.id", ondelete="CASCADE"), primary_key=True
    )
    source_id: Mapped[int] = mapped_column(
        ForeignKey("youtube_sources.id", ondelete="CASCADE"), primary_key=True
    )

    video: Mapped[YoutubeVideo] = relationship(back_populates="sources")
    source: Mapped[YoutubeSource] = relationship(back_populates="videos")


class RagChunk(Base, TimestampMixin):
    __tablename__ = "rag_chunks"
    __table_args__ = (
        CheckConstraint(
            "(post_id IS NOT NULL AND youtube_video_id IS NULL) OR "
            "(post_id IS NULL AND youtube_video_id IS NOT NULL)",
            name="ck_rag_chunk_exactly_one_source",
        ),
        Index("ux_rag_chunk_post_index", "post_id", "chunk_index", unique=True),
    Index("ux_rag_chunk_youtube_index", "youtube_video_id", "chunk_index", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    post_id: Mapped[int | None] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    youtube_video_id: Mapped[str | None] = mapped_column(
        ForeignKey("youtube_videos.id", ondelete="CASCADE"), nullable=True, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(EmbeddingVector(1536), nullable=False)

    post: Mapped[Post | None] = relationship(back_populates="rag_chunks")
    youtube_video: Mapped[YoutubeVideo | None] = relationship(back_populates="rag_chunks")


class RagEmbeddingJob(Base, TimestampMixin):
    __tablename__ = "rag_embedding_jobs"
    __table_args__ = (
        CheckConstraint("scope IN ('recent_90d', 'all')", name="ck_rag_embedding_job_scope"),
        CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_rag_embedding_job_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    batch_size: Mapped[int] = mapped_column(Integer, default=64, nullable=False)
    force: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    total_videos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_candidates: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    embedded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    remaining_missing: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        CheckConstraint("length(trim(event_name)) > 0", name="ck_analytics_event_name"),
        CheckConstraint(
            "length(trim(anonymous_session_id)) > 0",
            name="ck_analytics_anonymous_session",
        ),
        Index("ix_analytics_events_created_at", "created_at"),
        Index("ix_analytics_events_event_created", "event_name", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    anonymous_session_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    path: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    panel: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AiUsageCounter(Base):
    __tablename__ = "ai_usage_counters"
    __table_args__ = (UniqueConstraint("scope", "scope_id", "feature", "day", name="uq_ai_usage"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(80), nullable=False)
    feature: Mapped[str] = mapped_column(String(60), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AgentRun(Base, TimestampMixin):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    briefing_type: Mapped[str] = mapped_column(String(40), default="daily", nullable=False)
    briefing_date: Mapped[date] = mapped_column(Date, nullable=False)
    preview_markdown: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_post_id: Mapped[int | None] = mapped_column(
        ForeignKey("posts.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Briefing(Base, TimestampMixin):
    __tablename__ = "briefings"
    __table_args__ = (
        UniqueConstraint("artist_id", "briefing_date", "briefing_type", name="uq_briefing_once"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    briefing_date: Mapped[date] = mapped_column(Date, nullable=False)
    briefing_type: Mapped[str] = mapped_column(String(40), default="daily", nullable=False)


class McpCallLog(Base, TimestampMixin):
    __tablename__ = "mcp_call_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    tool_name: Mapped[str] = mapped_column(String(80), nullable=False)
    input_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    output_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
