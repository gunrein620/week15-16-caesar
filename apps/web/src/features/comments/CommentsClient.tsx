"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

type CommentItem = {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
};

export function CommentsClient({ reviewId }: { reviewId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadComments() {
    const [commentsResponse, meResponse] = await Promise.all([
      fetch(`/api/reviews/${reviewId}/comments`),
      fetch("/api/auth/me")
    ]);

    if (!commentsResponse.ok) {
      setError("댓글을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    const commentsBody = (await commentsResponse.json()) as { comments: CommentItem[] };
    const meBody = (await meResponse.json().catch(() => ({ user: null }))) as {
      user: CurrentUser | null;
    };
    setComments(commentsBody.comments);
    setCurrentUser(meBody.user);
    setError("");
    setIsLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [reviewId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch(`/api/reviews/${reviewId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content })
    });

    setIsSubmitting(false);

    if (response.status === 401) {
      setError("로그인이 필요합니다.");
      return;
    }

    if (!response.ok) {
      setError("댓글을 저장하지 못했습니다.");
      return;
    }

    setContent("");
    loadComments();
  }

  async function handleDelete(commentId: string) {
    const response = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setError("댓글을 삭제하지 못했습니다.");
      return;
    }

    loadComments();
  }

  return (
    <section className="comments-section">
      <div className="section-title">
        <h2>댓글</h2>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? <p className="helper-text">댓글을 불러오는 중</p> : null}

      {!isLoading && comments.length === 0 ? <p className="helper-text">아직 댓글이 없습니다.</p> : null}

      <div className="comment-list">
        {comments.map((comment) => (
          <article className="comment-item" key={comment.id}>
            <div>
              <div className="review-meta">
                <span>{comment.author.name}</span>
                <span>{new Date(comment.createdAt).toLocaleString("ko-KR")}</span>
              </div>
              <p>{comment.content}</p>
            </div>
            {currentUser?.id === comment.authorId ? (
              <button className="button danger" onClick={() => handleDelete(comment.id)} type="button">
                삭제
              </button>
            ) : null}
          </article>
        ))}
      </div>

      {currentUser ? (
        <form className="comment-form" onSubmit={handleSubmit}>
          <textarea
            aria-label="댓글 내용"
            onChange={(event) => setContent(event.target.value)}
            placeholder="댓글을 남겨보세요"
            required
            rows={3}
            value={content}
          />
          <button className="button primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "작성 중" : "댓글 작성"}
          </button>
        </form>
      ) : (
        <p className="helper-text">
          댓글을 쓰려면 <Link href="/login">로그인</Link>이 필요합니다.
        </p>
      )}
    </section>
  );
}
