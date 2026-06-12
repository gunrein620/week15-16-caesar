from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.password_policy import validate_password_strength


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    role: str
    email_verified_at: datetime | None = None
    active_session_count: int | None = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=80)
    role: Literal["user", "admin"] = "user"

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class AdminUserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    role: Literal["user", "admin"] | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_password_strength(value)


class AuthSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str


class UserProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=16, max_length=300)


class UserSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: str
    expires_at: datetime
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class ArtistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    description: str


class ArtistKeywordCreate(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)


class ArtistKeywordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    keyword: str


class ArtistArchiveTermCreate(BaseModel):
    term_type: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    aliases: list[str] = Field(default_factory=list, max_length=20)


class ArtistArchiveTermRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    term_type: str
    title: str
    aliases: list[str]


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    position: str = Field(default="", max_length=80)


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    name: str
    position: str


class PostCreate(BaseModel):
    category: str = Field(default="자유", min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    artist_id: int = 1
    tags: list[str] = Field(default_factory=list)


class PostUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=40)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    artist_id: int | None = None
    tags: list[str] | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CommentCreate(BaseModel):
    content: str = Field(min_length=1)


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    author: UserRead
    created_at: datetime


class PostRead(BaseModel):
    id: int
    category: str
    title: str
    content: str
    thumbnail_url: str = ""
    embeds: list[dict[str, Any]] = Field(default_factory=list)
    author: UserRead
    artist: ArtistRead
    tags: list[str]
    comment_count: int
    created_at: datetime
    updated_at: datetime


class PostList(BaseModel):
    items: list[PostRead]
    total: int
    page: int
    page_size: int


class QaRequest(BaseModel):
    question: str = Field(min_length=1)
    artist_id: int = 1
    limit: int = Field(default=10, ge=1, le=30)
    offset: int = Field(default=0, ge=0)
    include_answer: bool = True
    search_intent: dict[str, Any] | None = None


class QaResponse(BaseModel):
    answer: str
    sources: list[dict]
    has_more: bool = False
    next_offset: int | None = None
    search_intent: dict[str, Any] | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    artist_id: int = 1

    @model_validator(mode="after")
    def validate_last_message(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("last message must be from user")
        return self


class RagContextRequest(BaseModel):
    query: str = Field(default="", max_length=2000)
    artist_id: int = 1
    mode: Literal["briefing", "saved_summary", "writing_assist"] = "writing_assist"
    saved_only: bool = False
    limit: int = Field(default=5, ge=1, le=10)


class RagContextResponse(BaseModel):
    summary: str
    sources: list[dict]
    insert_text: str = ""


class SavedSummaryRequest(BaseModel):
    artist_id: int = 1
    limit: int = Field(default=5, ge=1, le=10)


class WritingAssistRequest(BaseModel):
    title: str = Field(default="", max_length=255)
    content: str = Field(default="", max_length=5000)
    category: str = Field(default="", max_length=40)
    artist_id: int = 1
    limit: int = Field(default=5, ge=1, le=10)


class SimilarRequest(BaseModel):
    post_id: int
    limit: int = Field(default=5, ge=1, le=10)


class SignupSettingsRead(BaseModel):
    public_signup_enabled: bool
    email_verification_enabled: bool


class SignupSettingsUpdate(BaseModel):
    public_signup_enabled: bool


class InfraCostSettings(BaseModel):
    hard_stop_enabled: bool
    manual_hard_stop: bool
    hard_stopped: bool
    monthly_budget_usd: float
    estimated_monthly_usd: float
    elapsed_estimated_usd: float
    budget_ratio: float
    railway_subscription_monthly_usd: float
    railway_backend_estimated_monthly_usd: float
    railway_db_estimated_monthly_usd: float
    vercel_estimated_monthly_usd: float
    period_start: str
    next_reset: str


class InfraCostSettingsUpdate(BaseModel):
    hard_stop_enabled: bool
    manual_hard_stop: bool
    monthly_budget_usd: float = Field(ge=0)
    railway_subscription_monthly_usd: float = Field(ge=0)
    railway_backend_estimated_monthly_usd: float = Field(ge=0)
    railway_db_estimated_monthly_usd: float = Field(ge=0)
    vercel_estimated_monthly_usd: float = Field(ge=0)


class SyncSettings(BaseModel):
    enabled: bool
    official_interval_minutes: int
    member_interval_minutes: int
    fan_interval_minutes: int
    curated_interval_minutes: int
    naver_interval_minutes: int
    keyword_interval_minutes: int
    last_official_sync_at: str | None
    last_member_sync_at: str | None
    last_fan_sync_at: str | None
    last_curated_sync_at: str | None
    last_naver_sync_at: str | None
    last_keyword_sync_at: str | None


class SyncSettingsUpdate(BaseModel):
    enabled: bool
    official_interval_minutes: int = Field(ge=30, le=1440)
    member_interval_minutes: int = Field(ge=30, le=1440)
    fan_interval_minutes: int = Field(ge=15, le=1440)
    curated_interval_minutes: int = Field(ge=60, le=1440)
    naver_interval_minutes: int = Field(ge=15, le=1440)
    keyword_interval_minutes: int = Field(ge=60, le=1440)


class RagCoverageRead(BaseModel):
    artist_id: int
    youtube_videos: int
    youtube_embedded_videos: int
    youtube_missing_videos: int
    youtube_stale_videos: int
    post_chunks: int
    youtube_chunks: int
    transcript_fetched_videos: int = 0
    transcript_unavailable_videos: int = 0
    transcript_pending_videos: int = 0
    transcript_chunks: int = 0
    external_update_chunks: int = 0
    estimated_tokens: int
    estimated_standard_cost_usd: float
    estimated_batch_cost_usd: float
    recent_90d_youtube_videos: int
    recent_90d_missing_videos: int


class RagCleanupRequest(BaseModel):
    artist_id: int = 1


class RagCleanupResult(BaseModel):
    orphan_deleted: int
    stale_deleted: int
    duplicate_deleted: int


class RagEmbedYoutubeRequest(BaseModel):
    artist_id: int = 1
    limit: int = Field(default=100, ge=1, le=500)
    days: int | None = Field(default=None, ge=1, le=3650)
    source_type: str | None = None
    force: bool = False


class RagEmbedYoutubeResult(BaseModel):
    processed: int
    embedded: int
    skipped: int
    failed: int
    created_chunks: int
    remaining_missing: int
    estimated_tokens: int


class RagTranscriptBatchRequest(BaseModel):
    artist_id: int = 1
    limit: int = Field(default=25, ge=1, le=100)
    days: int | None = Field(default=None, ge=1, le=3650)
    force: bool = False


class RagTranscriptBatchResult(BaseModel):
    processed: int
    fetched: int
    unavailable: int
    failed: int
    created_chunks: int


class RagTranscriptUploadSegment(BaseModel):
    start: float = Field(ge=0)
    text: str = Field(max_length=2000)


class RagTranscriptUploadRequest(BaseModel):
    video_id: str
    lang: str = Field(default="", max_length=16)
    segments: list[RagTranscriptUploadSegment] = Field(default_factory=list, max_length=5000)
    mark_unavailable: bool = False


class RagTranscriptUploadResult(BaseModel):
    video_id: str
    created_chunks: int
    status: str


class RagTranscriptPendingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    published_at: datetime | None
    transcript_status: str


class RagExternalUpdateBackfillRequest(BaseModel):
    artist_id: int = 1
    limit: int = Field(default=200, ge=1, le=500)


class RagExternalUpdateBackfillResult(BaseModel):
    processed: int
    embedded: int
    skipped: int


class RagEmbeddingJobCreate(BaseModel):
    artist_id: int = 1
    scope: Literal["recent_90d", "all"] = "recent_90d"
    source_type: str | None = None
    batch_size: int = Field(default=64, ge=1, le=256)
    force: bool = False


class RagEmbeddingJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    user_id: int | None
    scope: str
    source_type: str | None
    batch_size: int
    force: bool
    status: str
    total_videos: int
    total_candidates: int
    processed: int
    embedded: int
    failed: int
    created_chunks: int
    estimated_tokens: int
    remaining_missing: int
    last_error: str
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class YoutubeSourceCreate(BaseModel):
    source_type: str = Field(min_length=1, max_length=40)
    source_value: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=160)


class YoutubeSourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    source_type: str
    source_value: str
    title: str
    enabled: bool
    backfill_cursor: str | None = None
    backfill_status: str = "idle"
    backfill_started_at: datetime | None = None
    backfill_completed_at: datetime | None = None
    backfill_error: str = ""


class YoutubeBackfillRequest(BaseModel):
    source_id: int | None = None
    published_after: datetime | None = None
    pages_per_source: int = Field(default=5, ge=1, le=20)
    reset: bool = False
    metadata_only: bool = True


class YoutubeBackfillResult(BaseModel):
    created: int
    updated: int
    linked: int
    pages_fetched: int
    sources_processed: int
    sources_completed: int
    has_more: bool


class YoutubeVideoRead(BaseModel):
    id: str
    title: str
    description: str
    channel_title: str
    published_at: datetime | None
    thumbnail_url: str
    url: str
    view_count: int | None
    like_count: int | None
    comment_count: int | None


class UpdateFeedItem(BaseModel):
    id: str
    item_type: str
    title: str
    description: str
    url: str
    thumbnail_url: str = ""
    source_label: str
    published_at: datetime
    view_count: int | None = None
    comment_count: int | None = None
    matched_keywords: list[str] = Field(default_factory=list)
    member_names: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class UpdateFeedResponse(BaseModel):
    artist_id: int
    items: list[UpdateFeedItem]
    naver_available: bool
    next_cursor: str | None = None
    has_more: bool = False


class BriefingPreviewResponse(BaseModel):
    run_id: int
    preview_markdown: str
    briefing_date: date
    briefing_type: str
    source_cards: list[dict[str, Any]] = Field(default_factory=list)


class AgentRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    user_id: int
    status: str
    briefing_type: str
    briefing_date: date
    preview_markdown: str
    created_post_id: int | None
    tool_calls: list[dict] = Field(default_factory=list)


class SavedItemCreate(BaseModel):
    item_type: str = Field(min_length=1, max_length=40)
    item_id: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=1000)
    title: str = Field(min_length=1, max_length=255)
    thumbnail_url: str = Field(default="", max_length=1000)
    source_label: str = Field(default="", max_length=120)


class SavedItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_type: str
    item_key: str
    title: str
    url: str
    thumbnail_url: str
    source_label: str
    saved_at: datetime


AnalyticsEventName = Literal[
    "app_open",
    "panel_view",
    "feed_filter_change",
    "archive_search_submit",
    "archive_search_load_more",
    "feed_card_open",
    "youtube_app_open",
    "saved_item_add",
    "post_open",
    "post_create",
    "comment_create",
]


class AnalyticsEventCreate(BaseModel):
    event_name: AnalyticsEventName
    anonymous_session_id: str = Field(min_length=1, max_length=120)
    path: str = Field(default="", max_length=300)
    panel: str = Field(default="", max_length=60)
    source: str = Field(default="frontend", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_metadata(self) -> "AnalyticsEventCreate":
        query = self.metadata.get("query")
        if isinstance(query, str) and len(query) > 120:
            raise ValueError("metadata.query must be 120 characters or fewer")
        if len(str(self.metadata)) > 2000:
            raise ValueError("metadata is too large")
        return self


class AnalyticsEventsCreate(BaseModel):
    event_name: AnalyticsEventName | None = None
    anonymous_session_id: str | None = Field(default=None, min_length=1, max_length=120)
    path: str = Field(default="", max_length=300)
    panel: str = Field(default="", max_length=60)
    source: str = Field(default="frontend", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)
    events: list[AnalyticsEventCreate] | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def normalize_events(self) -> "AnalyticsEventsCreate":
        if self.events is not None:
            if not self.events:
                raise ValueError("events must not be empty")
            return self
        if self.event_name is None or self.anonymous_session_id is None:
            raise ValueError("event_name and anonymous_session_id are required")
        event = AnalyticsEventCreate(
            event_name=self.event_name,
            anonymous_session_id=self.anonymous_session_id,
            path=self.path,
            panel=self.panel,
            source=self.source,
            metadata=self.metadata,
        )
        self.events = [event]
        return self


class AnalyticsCollectResponse(BaseModel):
    accepted: int


class AnalyticsEventRead(BaseModel):
    id: int
    event_name: str
    anonymous_session_id: str
    user_id: int | None
    path: str
    panel: str
    source: str
    metadata: dict[str, Any]
    created_at: datetime


class AnalyticsMetricRow(BaseModel):
    label: str
    count: int


class AnalyticsQueryRow(BaseModel):
    query: str
    count: int


class AnalyticsCardRow(BaseModel):
    title: str
    item_type: str
    item_key: str
    count: int


class AnalyticsSummary(BaseModel):
    days: int
    visitors: int
    today_visitors: int
    logged_in_users: int
    events: int
    searches: int
    saves: int
    posts: int
    comments: int
    ai_questions: int
    popular_panels: list[AnalyticsMetricRow]
    popular_paths: list[AnalyticsMetricRow]
    popular_queries: list[AnalyticsQueryRow]
    popular_cards: list[AnalyticsCardRow]


class AnalyticsCleanupResponse(BaseModel):
    deleted: int
