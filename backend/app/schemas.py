from datetime import date, datetime

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


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    artist_id: int = 1
    tags: list[str] = Field(default_factory=list)


class PostUpdate(BaseModel):
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
    title: str
    content: str
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


class YoutubeSourceCreate(BaseModel):
    source_type: str
    source_value: str
    title: str


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
    thumbnail_url: str
    url: str


class BriefingPreviewResponse(BaseModel):
    run_id: int
    preview_markdown: str
    briefing_date: date
    briefing_type: str


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
