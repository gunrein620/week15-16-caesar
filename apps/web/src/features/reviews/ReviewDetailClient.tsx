"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CommentsClient } from "@/features/comments/CommentsClient";
import { ReviewForm } from "./ReviewForm";
import { SimilarReviews } from "./SimilarReviews";
import { StarRating } from "./StarRating";

type ReviewDetail = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  rating: number | null;
  menuNames: string[];
  helpfulCount: number;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
  tags: Array<{
    tag: {
      name: string;
    };
  }>;
};

type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

type NeighborReview = { id: string; title: string } | null;

export function ReviewDetailClient({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev: NeighborReview; next: NeighborReview }>({
    prev: null,
    next: null
  });
  const [helpful, setHelpful] = useState(0);
  const [helpfulDone, setHelpfulDone] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  async function handleHelpful() {
    if (helpfulDone) {
      return;
    }
    setHelpful((prev) => prev + 1);
    setHelpfulDone(true);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/helpful`, { method: "POST" });
      if (response.ok) {
        const body = (await response.json()) as { helpfulCount: number };
        setHelpful(body.helpfulCount);
      }
    } catch {
      // 실패해도 낙관적 증가는 유지
    }
  }

  async function loadReview() {
    const [reviewResponse, meResponse] = await Promise.all([
      fetch(`/api/reviews/${reviewId}`),
      fetch("/api/auth/me")
    ]);

    if (!reviewResponse.ok) {
      setError("후기를 찾지 못했습니다.");
      setIsLoading(false);
      return;
    }

    const reviewBody = (await reviewResponse.json()) as {
      review: ReviewDetail;
      neighbors?: { prev: NeighborReview; next: NeighborReview };
    };
    const meBody = (await meResponse.json().catch(() => ({ user: null }))) as {
      user: CurrentUser | null;
    };
    setReview(reviewBody.review);
    setHelpful(reviewBody.review.helpfulCount ?? 0);
    setNeighbors(reviewBody.neighbors ?? { prev: null, next: null });
    setCurrentUser(meBody.user);
    setError("");
    setIsLoading(false);
  }

  useEffect(() => {
    loadReview();
  }, [reviewId]);

  const canEdit = Boolean(review && currentUser && review.author.id === currentUser.id);
  const initialValue = useMemo(
    () =>
      review
        ? {
            title: review.title,
            content: review.content,
            rating: review.rating ? String(review.rating) : "",
            menuNames: review.menuNames.join(", "),
            tags: review.tags.map(({ tag }) => tag.name).join(", ")
          }
        : undefined,
    [review]
  );

  async function handleDelete() {
    const response = await fetch(`/api/reviews/${reviewId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setError("후기를 삭제하지 못했습니다.");
      return;
    }

    router.push("/reviews");
    router.refresh();
  }

  if (isLoading) {
    return <p className="helper-text">불러오는 중</p>;
  }

  if (error || !review) {
    return (
      <section className="panel">
        <h2>후기를 찾을 수 없습니다.</h2>
        <p>{error}</p>
        <Link className="button" href="/reviews">
          목록으로
        </Link>
      </section>
    );
  }

  return (
    <section className="review-detail">
      <div className="toolbar">
        <Link className="button" href="/reviews">
          목록
        </Link>
        {canEdit ? (
          <div className="button-row">
            <button className="button" onClick={() => setIsEditing((current) => !current)} type="button">
              {isEditing ? "수정 취소" : "수정"}
            </button>
            <button className="button danger" onClick={handleDelete} type="button">
              삭제
            </button>
          </div>
        ) : null}
      </div>

      {isEditing && initialValue ? (
        <ReviewForm
          initialValue={initialValue}
          mode="edit"
          onSaved={() => {
            setIsEditing(false);
            loadReview();
          }}
          reviewId={review.id}
        />
      ) : (
        <article className="panel review-detail-card">
          <div className="review-meta">
            <span>{review.author.name}</span>
            <span>{new Date(review.createdAt).toLocaleDateString("ko-KR")}</span>
            <StarRating size="sm" value={review.rating} />
          </div>
          <h1>{review.title}</h1>
          <p className="review-body">{review.content}</p>
          <div className="tag-row">
            {review.menuNames.map((name) => (
              <span className="tag" key={`menu-${name}`}>
                {name}
              </span>
            ))}
            {review.tags.map(({ tag }) => (
              <span className="tag muted" key={tag.name}>
                #{tag.name}
              </span>
            ))}
          </div>
          <div className="helpful-row">
            <span>이 후기가 도움됐나요?</span>
            <button
              className={`button helpful-button ${helpfulDone ? "done" : ""}`}
              disabled={helpfulDone}
              onClick={handleHelpful}
              type="button"
            >
              👍 도움돼요 {helpful}
            </button>
          </div>
        </article>
      )}
      {neighbors.prev || neighbors.next ? (
        <nav className="review-nav" aria-label="이전 다음 후기">
          {neighbors.prev ? (
            <Link className="review-nav-item" href={`/reviews/${neighbors.prev.id}`}>
              <span className="review-nav-dir">← 이전 후기</span>
              <span className="review-nav-title">{neighbors.prev.title}</span>
            </Link>
          ) : (
            <span className="review-nav-item review-nav-empty" />
          )}
          {neighbors.next ? (
            <Link className="review-nav-item review-nav-next" href={`/reviews/${neighbors.next.id}`}>
              <span className="review-nav-dir">다음 후기 →</span>
              <span className="review-nav-title">{neighbors.next.title}</span>
            </Link>
          ) : (
            <span className="review-nav-item review-nav-empty" />
          )}
        </nav>
      ) : null}

      <SimilarReviews query={[review.title, ...review.menuNames].join(" ")} reviewId={review.id} />
      <CommentsClient reviewId={review.id} />
    </section>
  );
}
