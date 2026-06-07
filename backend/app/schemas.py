from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    role: str


class AuthSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=80)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


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


class QaResponse(BaseModel):
    answer: str
    sources: list[dict]


class SimilarRequest(BaseModel):
    post_id: int
    limit: int = Field(default=5, ge=1, le=10)


class SignupSettingsRead(BaseModel):
    public_signup_enabled: bool


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
    channel_interval_minutes: int
    naver_interval_minutes: int
    keyword_interval_minutes: int
    last_channel_sync_at: str | None
    last_naver_sync_at: str | None
    last_keyword_sync_at: str | None


class SyncSettingsUpdate(BaseModel):
    enabled: bool
    channel_interval_minutes: int = Field(ge=15, le=1440)
    naver_interval_minutes: int = Field(ge=15, le=1440)
    keyword_interval_minutes: int = Field(ge=60, le=1440)


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
