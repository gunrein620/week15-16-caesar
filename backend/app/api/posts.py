from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.dependencies import get_current_user
from app.models import Artist, Comment, Post, PostTag, RagChunk, Tag, User
from app.schemas import CommentCreate, CommentRead, PostCreate, PostList, PostRead, PostUpdate, TagRead
from app.services.embeds import build_post_embeds
from app.services.rag import refresh_post_chunks

router = APIRouter(tags=["posts"])


def _category(value: str | None) -> str:
    normalized = (value or "자유").strip()
    return normalized[:40] or "자유"


def _post_read(post: Post) -> PostRead:
    return PostRead(
        id=post.id,
        category=post.category,
        title=post.title,
        content=post.content,
        thumbnail_url=post.thumbnail_url,
        embeds=post.embeds or [],
        author=post.author,
        artist=post.artist,
        tags=sorted(post_tag.tag.name for post_tag in post.tags),
        comment_count=len(post.comments),
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _set_tags(db: Session, post: Post, names: list[str]) -> None:
    post.tags.clear()
    normalized = sorted({name.strip().lower() for name in names if name.strip()})
    for name in normalized:
        tag = db.scalar(select(Tag).where(Tag.name == name))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
        post.tags.append(PostTag(post_id=post.id, tag_id=tag.id, tag=tag))


def _post_query():
    return select(Post).options(
        joinedload(Post.author),
        joinedload(Post.artist),
        joinedload(Post.comments).joinedload(Comment.author),
        joinedload(Post.tags).joinedload(PostTag.tag),
    )


@router.get("/posts", response_model=PostList)
def list_posts(
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    artist_id: int | None = None,
    tag: str | None = None,
) -> PostList:
    stmt = _post_query()
    count_stmt = select(func.count(Post.id))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(Post.title.ilike(pattern) | Post.content.ilike(pattern))
        count_stmt = count_stmt.where(Post.title.ilike(pattern) | Post.content.ilike(pattern))
    if artist_id:
        stmt = stmt.where(Post.artist_id == artist_id)
        count_stmt = count_stmt.where(Post.artist_id == artist_id)
    if tag:
        stmt = stmt.join(PostTag).join(Tag).where(Tag.name == tag.lower())
        count_stmt = count_stmt.join(PostTag).join(Tag).where(Tag.name == tag.lower())
    total = db.scalar(count_stmt) or 0
    posts = (
        db.scalars(
            stmt.order_by(Post.created_at.desc(), Post.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )
    return PostList(items=[_post_read(post) for post in posts], total=total, page=page, page_size=page_size)


@router.post("/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PostRead:
    artist = db.get(Artist, payload.artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    embeds, thumbnail_url = build_post_embeds(payload.content)
    post = Post(
        category=_category(payload.category),
        title=payload.title,
        content=payload.content,
        thumbnail_url=thumbnail_url,
        embeds=embeds,
        author_id=user.id,
        artist_id=artist.id,
    )
    db.add(post)
    db.flush()
    _set_tags(db, post, payload.tags)
    refresh_post_chunks(db, post)
    db.commit()
    db.refresh(post)
    post = db.scalars(_post_query().where(Post.id == post.id)).unique().one()
    return _post_read(post)


@router.get("/posts/{post_id}", response_model=PostRead)
def get_post(post_id: int, db: Annotated[Session, Depends(get_db)]) -> PostRead:
    post = db.scalars(_post_query().where(Post.id == post_id)).unique().first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return _post_read(post)


@router.put("/posts/{post_id}", response_model=PostRead)
def update_post(
    post_id: int,
    payload: PostUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PostRead:
    post = db.scalars(_post_query().where(Post.id == post_id)).unique().first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if payload.artist_id is not None and db.get(Artist, payload.artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    if payload.title is not None:
        post.title = payload.title
    if payload.content is not None:
        post.content = payload.content
        post.embeds, post.thumbnail_url = build_post_embeds(payload.content)
    if payload.category is not None:
        post.category = _category(payload.category)
    if payload.artist_id is not None:
        post.artist_id = payload.artist_id
    if payload.tags is not None:
        _set_tags(db, post, payload.tags)
    refresh_post_chunks(db, post)
    db.commit()
    post = db.scalars(_post_query().where(Post.id == post.id)).unique().one()
    return _post_read(post)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    db.query(RagChunk).filter(RagChunk.post_id == post_id).delete()
    db.delete(post)
    db.commit()


@router.get("/posts/{post_id}/comments", response_model=list[CommentRead])
def list_comments(post_id: int, db: Annotated[Session, Depends(get_db)]) -> list[Comment]:
    return db.scalars(
        select(Comment)
        .options(joinedload(Comment.author))
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
    ).all()


@router.post("/posts/{post_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def create_comment(
    post_id: int,
    payload: CommentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Comment:
    if db.get(Post, post_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    comment = Comment(post_id=post_id, author_id=user.id, content=payload.content)
    db.add(comment)
    db.commit()
    return db.scalars(select(Comment).options(joinedload(Comment.author)).where(Comment.id == comment.id)).one()


@router.get("/tags", response_model=list[TagRead])
def list_tags(db: Annotated[Session, Depends(get_db)]) -> list[Tag]:
    return db.scalars(select(Tag).order_by(Tag.name.asc())).all()
