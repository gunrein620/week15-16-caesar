from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.security import utc_now
from app.dependencies import require_admin, require_verified_user
from app.models import Collection, CollectionItem, DataQualityTask, SearchItem, User, UserNotification, UserSubscription
from app.schemas import (
    AgentRunRead,
    AutoBriefingDraftResponse,
    CollectionCreate,
    CollectionDetailRead,
    CollectionItemCreate,
    CollectionItemRead,
    CollectionRead,
    CollectionSummaryRead,
    CollectionUpdate,
    DataQualityBuildResult,
    DataQualityTaskRead,
    UserNotificationRead,
    UserSubscriptionCreate,
    UserSubscriptionRead,
    UserSubscriptionUpdate,
)
from app.services.product_workflows import (
    add_collection_item,
    build_data_quality_tasks,
    collection_summary_text,
    create_auto_briefing_draft,
    run_data_quality_task,
)

router = APIRouter(tags=["product-workflows"])


def _clean_strings(values: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for value in values:
        text = value.strip()
        if text:
            seen.setdefault(text, None)
    return list(seen)


def _clean_ints(values: list[int]) -> list[int]:
    seen: dict[int, None] = {}
    for value in values:
        seen.setdefault(int(value), None)
    return list(seen)


def _collection_for_user(db: Session, user: User, collection_id: int) -> Collection:
    collection = db.scalar(
        select(Collection)
        .where(Collection.id == collection_id, Collection.user_id == user.id)
        .options(selectinload(Collection.items))
    )
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    return collection


def _task_payload(task: DataQualityTask) -> DataQualityTaskRead:
    item = task.search_item
    return DataQualityTaskRead(
        id=task.id,
        artist_id=task.artist_id,
        search_item_id=task.search_item_id,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        error_message=task.error_message,
        resolved_at=task.resolved_at,
        title=item.title if item is not None else "",
        source_type=item.item_type if item is not None else "",
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _agent_run_read(run) -> AgentRunRead:
    return AgentRunRead(
        id=run.id,
        artist_id=run.artist_id,
        user_id=run.user_id,
        status=run.status,
        briefing_type=run.briefing_type,
        briefing_date=run.briefing_date,
        preview_markdown=run.preview_markdown,
        created_post_id=run.created_post_id,
        tool_calls=[],
    )


@router.post(
    "/subscriptions",
    response_model=UserSubscriptionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_subscription(
    payload: UserSubscriptionCreate,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserSubscription:
    subscription = UserSubscription(
        user_id=user.id,
        artist_id=payload.artist_id,
        name=payload.name.strip(),
        content_types=_clean_strings(payload.content_types),
        source_types=_clean_strings(payload.source_types),
        member_names=_clean_strings(payload.member_names),
        archive_term_ids=_clean_ints(payload.archive_term_ids),
        enabled=payload.enabled,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


@router.get("/subscriptions", response_model=list[UserSubscriptionRead])
def list_subscriptions(
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int | None = None,
) -> list[UserSubscription]:
    stmt = select(UserSubscription).where(UserSubscription.user_id == user.id)
    if artist_id is not None:
        stmt = stmt.where(UserSubscription.artist_id == artist_id)
    return db.scalars(stmt.order_by(UserSubscription.created_at.desc())).all()


@router.patch("/subscriptions/{subscription_id}", response_model=UserSubscriptionRead)
def update_subscription(
    subscription_id: int,
    payload: UserSubscriptionUpdate,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserSubscription:
    subscription = db.get(UserSubscription, subscription_id)
    if subscription is None or subscription.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    if payload.name is not None:
        subscription.name = payload.name.strip()
    if payload.content_types is not None:
        subscription.content_types = _clean_strings(payload.content_types)
    if payload.source_types is not None:
        subscription.source_types = _clean_strings(payload.source_types)
    if payload.member_names is not None:
        subscription.member_names = _clean_strings(payload.member_names)
    if payload.archive_term_ids is not None:
        subscription.archive_term_ids = _clean_ints(payload.archive_term_ids)
    if payload.enabled is not None:
        subscription.enabled = payload.enabled
    db.commit()
    db.refresh(subscription)
    return subscription


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(
    subscription_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    subscription = db.get(UserSubscription, subscription_id)
    if subscription is None or subscription.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    db.delete(subscription)
    db.commit()


@router.get("/notifications", response_model=list[UserNotificationRead])
def list_notifications(
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[UserNotification]:
    stmt = select(UserNotification).where(UserNotification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(UserNotification.read_at.is_(None))
    return db.scalars(
        stmt.order_by(UserNotification.created_at.desc(), UserNotification.id.desc()).limit(limit)
    ).all()


@router.post("/notifications/{notification_id}/read", response_model=UserNotificationRead)
def mark_notification_read(
    notification_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserNotification:
    notification = db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if notification.read_at is None:
        notification.read_at = utc_now()
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/collections", response_model=CollectionRead, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreate,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Collection:
    collection = Collection(
        user_id=user.id,
        artist_id=payload.artist_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection


@router.get("/collections", response_model=list[CollectionRead])
def list_collections(
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int | None = None,
) -> list[Collection]:
    stmt = select(Collection).where(Collection.user_id == user.id)
    if artist_id is not None:
        stmt = stmt.where(Collection.artist_id == artist_id)
    return db.scalars(stmt.order_by(Collection.updated_at.desc(), Collection.id.desc())).all()


@router.get("/collections/{collection_id}", response_model=CollectionDetailRead)
def get_collection(
    collection_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Collection:
    return _collection_for_user(db, user, collection_id)


@router.patch("/collections/{collection_id}", response_model=CollectionRead)
def update_collection(
    collection_id: int,
    payload: CollectionUpdate,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Collection:
    collection = _collection_for_user(db, user, collection_id)
    if payload.title is not None:
        collection.title = payload.title.strip()
    if payload.description is not None:
        collection.description = payload.description.strip()
    db.commit()
    db.refresh(collection)
    return collection


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    collection = _collection_for_user(db, user, collection_id)
    db.execute(delete(CollectionItem).where(CollectionItem.collection_id == collection.id))
    db.delete(collection)
    db.commit()


@router.post(
    "/collections/{collection_id}/items",
    response_model=CollectionItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_item_to_collection(
    collection_id: int,
    payload: CollectionItemCreate,
    response: Response,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CollectionItem:
    collection = _collection_for_user(db, user, collection_id)
    search_item = db.get(SearchItem, payload.search_item_id)
    if search_item is None or search_item.artist_id != collection.artist_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search item not found")
    item, created = add_collection_item(
        db,
        collection=collection,
        search_item=search_item,
        note=payload.note,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/collections/{collection_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_item_from_collection(
    collection_id: int,
    item_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    collection = _collection_for_user(db, user, collection_id)
    item = db.get(CollectionItem, item_id)
    if item is None or item.collection_id != collection.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection item not found")
    db.delete(item)
    db.commit()


@router.post("/collections/{collection_id}/summary", response_model=CollectionSummaryRead)
def summarize_collection(
    collection_id: int,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CollectionSummaryRead:
    collection = _collection_for_user(db, user, collection_id)
    collection.ai_summary = collection_summary_text(collection)
    db.commit()
    db.refresh(collection)
    return CollectionSummaryRead(collection_id=collection.id, ai_summary=collection.ai_summary)


@router.post("/admin/data-quality/tasks/build", response_model=DataQualityBuildResult)
def build_admin_data_quality_tasks(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
) -> dict[str, int]:
    result = build_data_quality_tasks(db, artist_id=artist_id)
    db.commit()
    return result


@router.get("/admin/data-quality/tasks", response_model=list[DataQualityTaskRead])
def list_admin_data_quality_tasks(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[DataQualityTaskRead]:
    stmt = (
        select(DataQualityTask)
        .where(DataQualityTask.artist_id == artist_id)
        .options(selectinload(DataQualityTask.search_item))
    )
    if status_filter:
        stmt = stmt.where(DataQualityTask.status == status_filter)
    tasks = db.scalars(
        stmt.order_by(DataQualityTask.priority.desc(), DataQualityTask.created_at.asc())
    ).all()
    return [_task_payload(task) for task in tasks]


@router.post("/admin/data-quality/tasks/{task_id}/run", response_model=DataQualityTaskRead)
def run_admin_data_quality_task(
    task_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> DataQualityTaskRead:
    task = db.scalar(
        select(DataQualityTask)
        .where(DataQualityTask.id == task_id)
        .options(
            selectinload(DataQualityTask.search_item).selectinload(SearchItem.youtube_video),
            selectinload(DataQualityTask.search_item).selectinload(SearchItem.post),
            selectinload(DataQualityTask.search_item).selectinload(SearchItem.external_update),
            selectinload(DataQualityTask.search_item).selectinload(SearchItem.sources),
        )
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    run_data_quality_task(db, task)
    db.commit()
    db.refresh(task)
    return _task_payload(task)


@router.post("/admin/briefing/auto-drafts/run", response_model=AutoBriefingDraftResponse)
def run_admin_auto_briefing_draft(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
) -> AutoBriefingDraftResponse:
    try:
        run, created = create_auto_briefing_draft(db, artist_id=artist_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    db.commit()
    db.refresh(run)
    return AutoBriefingDraftResponse(created=created, run=_agent_run_read(run))
