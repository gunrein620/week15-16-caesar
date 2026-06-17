"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Heart,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AiEvidenceSummary } from "@/components/ai-evidence-summary";
import { showBrowserNotification } from "@/lib/browser-notifications";
import type { FeedMealMenu } from "@/types/meal";
import type {
  FeedAiJudgement,
  FeedAuthor,
  FeedComment,
  FeedPost,
  InitialSession,
  SnackAiVerdict,
  SnackVoteType,
} from "@/types/post";
import { voteTypes } from "@/types/post";

const voteLabels: Record<SnackVoteType, string> = {
  INNOCENT: "무죄",
  PROBATION: "집행유예",
  GUILTY_BUT_UNDERSTANDABLE: "유죄지만 정상참작",
  NOT_GUILTY_BY_CONTEXT: "정황상 무죄",
  NEEDS_MORE_EXCUSE: "변명 보강 필요",
};

const aiVerdictLabels: Record<SnackAiVerdict, string> = {
  INNOCENT: "AI 무죄",
  PROBATION: "AI 집행유예",
  GUILTY_BUT_UNDERSTANDABLE: "AI 유죄지만 정상참작",
  NEEDS_MORE_CONTEXT: "AI 정황 더 필요",
};

const aiVerdictStyles: Record<SnackAiVerdict, string> = {
  INNOCENT: "bg-[#e6faf4] text-[var(--jungle-deep)] ring-[#99ebd3]",
  PROBATION: "bg-[#fff7d7] text-[#7a5200] ring-[#f1cf73]",
  GUILTY_BUT_UNDERSTANDABLE: "bg-[#fff0f5] text-[#ad315c] ring-[#f3a9bf]",
  NEEDS_MORE_CONTEXT: "bg-[#eef0ff] text-[var(--jungle-purple)] ring-[#c3c8ff]",
};

type PostDetailAppProps = {
  initialPost: FeedPost;
  initialComments: FeedComment[];
  initialSession: InitialSession;
};

function authorName(author: FeedAuthor) {
  return author.name || author.email || "익명의 정글러";
}

function avatarInitial(author: FeedAuthor) {
  return authorName(author).slice(0, 1).toUpperCase();
}

function totalVoteCount(post: FeedPost) {
  return voteTypes.reduce((total, type) => total + (post.voteCounts[type] ?? 0), 0);
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Avatar({ author, size = "md" }: { author: FeedAuthor; size?: "sm" | "md" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === "sm" ? "size-9" : "size-12";

  if (author.image && !imageFailed) {
    return (
      <img
        src={author.image}
        alt={`${authorName(author)} 프로필`}
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-[var(--jungle-deep)] text-sm font-black text-white shadow-sm`}
    >
      {avatarInitial(author)}
    </div>
  );
}

function ImageSlider({ post }: { post: FeedPost }) {
  const [index, setIndex] = useState(0);

  if (!post.images.length) {
    return null;
  }

  const currentIndex = Math.min(index, post.images.length - 1);
  const image = post.images[currentIndex];
  const hasControls = post.images.length > 1;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
      <div className="relative aspect-[4/3]">
        <img
          src={image.url}
          alt={image.altText ?? `${post.snackName} 증거 사진`}
          className="h-full w-full object-cover"
        />
        <div className="absolute left-3 top-3 rounded-full bg-zinc-950/75 px-2.5 py-1 text-xs font-black text-white">
          증거 {currentIndex + 1}/{post.images.length}
        </div>

        {hasControls ? (
          <>
            <button
              type="button"
              aria-label="이전 이미지"
              onClick={() => setIndex((current) => (current <= 0 ? post.images.length - 1 : current - 1))}
              className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-800 shadow-sm transition hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="다음 이미지"
              onClick={() => setIndex((current) => (current + 1) % post.images.length)}
              className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-800 shadow-sm transition hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MealContext({ post }: { post: FeedPost }) {
  const meals = [post.mealContext?.lunchMenu, post.mealContext?.dinnerMenu].filter(
    (meal): meal is FeedMealMenu => Boolean(meal),
  );

  if (!post.mealContext || meals.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-[#ccf5e9] bg-[#e6faf4] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-[var(--jungle-deep)]">
        <CalendarDays size={16} />
        식단 증거
      </div>
      <div className="grid gap-2">
        {meals.map((meal) => (
          <div key={meal.id} className="rounded-lg bg-white p-3 text-sm ring-1 ring-[#ccf5e9]">
            <p className="font-black">
              {meal.mealDate} {meal.mealType === "LUNCH" ? "중식" : "석식"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words leading-6 text-zinc-700">
              {meal.menuText || "메뉴 텍스트가 아직 공개되지 않았습니다."}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommentRow({
  comment,
  currentUserId,
  busyLike,
  busyDelete,
  onLike,
  onDelete,
}: {
  comment: FeedComment;
  currentUserId?: string;
  busyLike: boolean;
  busyDelete: boolean;
  onLike: (comment: FeedComment) => void;
  onDelete: (comment: FeedComment) => void;
}) {
  const mine = currentUserId === comment.author.id;

  return (
    <div className="flex gap-3 border-t border-zinc-100 py-4 first:border-t-0">
      <Avatar author={comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-black">{authorName(comment.author)}</p>
          <p className="text-xs font-semibold text-zinc-500">{formatCreatedAt(comment.createdAt)}</p>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
          {comment.content}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLike(comment)}
            disabled={!currentUserId || busyLike}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-black ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
              comment.myLiked
                ? "bg-[#e6faf4] text-[var(--jungle-deep)] ring-[#99ebd3]"
                : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {busyLike ? <Loader2 size={13} className="animate-spin" /> : <Heart size={13} />}
            {comment.likeCount}
          </button>
          {mine ? (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              disabled={busyDelete}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-black text-zinc-500 ring-1 ring-zinc-200 transition hover:text-[#ad315c] disabled:cursor-wait disabled:opacity-50"
            >
              {busyDelete ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              삭제
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PostDetailApp({
  initialPost,
  initialComments,
  initialSession,
}: PostDetailAppProps) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState(initialComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [judging, setJudging] = useState(false);
  const [expandedJudgement, setExpandedJudgement] = useState(false);

  const signedIn = Boolean(initialSession?.user?.id);
  const mine = initialSession?.user?.id === post.author.id;
  const voteTotal = totalVoteCount(post);

  async function submitVote(type: SnackVoteType) {
    if (!signedIn) {
      setMessage("로그인 후 판결에 참여할 수 있습니다.");
      return;
    }

    setVoting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${post.id}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = (await response.json()) as {
        voteCounts?: FeedPost["voteCounts"];
        myVote?: SnackVoteType | null;
        message?: string;
      };

      if (!response.ok || !data.voteCounts) {
        throw new Error(data.message || "판결 투표에 실패했습니다.");
      }

      setPost((current) => ({
        ...current,
        voteCounts: data.voteCounts!,
        myVote: data.myVote ?? null,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "판결 투표에 실패했습니다.");
    } finally {
      setVoting(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signedIn) {
      setMessage("로그인 후 댓글을 쓸 수 있습니다.");
      return;
    }

    const content = commentDraft.trim();
    if (!content) {
      return;
    }

    setSubmittingComment(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json()) as { comment?: FeedComment; message?: string };

      if (!response.ok || !data.comment) {
        throw new Error(data.message || "댓글 작성에 실패했습니다.");
      }

      setComments((current) => [data.comment!, ...current]);
      setPost((current) => ({ ...current, commentCount: current.commentCount + 1 }));
      setCommentDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 작성에 실패했습니다.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function toggleCommentLike(comment: FeedComment) {
    if (!signedIn) {
      setMessage("로그인 후 댓글에 좋아요를 누를 수 있습니다.");
      return;
    }

    setLikingCommentId(comment.id);

    try {
      const response = await fetch(`/api/comments/${comment.id}/likes`, {
        method: comment.myLiked ? "DELETE" : "POST",
      });
      const data = (await response.json()) as {
        commentId?: string;
        likeCount?: number;
        myLiked?: boolean;
        message?: string;
      };

      if (!response.ok || !data.commentId || typeof data.likeCount !== "number") {
        throw new Error(data.message || "댓글 좋아요 처리에 실패했습니다.");
      }

      setComments((current) =>
        current.map((item) =>
          item.id === data.commentId
            ? { ...item, likeCount: data.likeCount!, myLiked: Boolean(data.myLiked) }
            : item,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 좋아요 처리에 실패했습니다.");
    } finally {
      setLikingCommentId(null);
    }
  }

  async function deleteComment(comment: FeedComment) {
    if (!signedIn || initialSession?.user?.id !== comment.author.id) {
      return;
    }

    setDeletingCommentId(comment.id);

    try {
      const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "댓글 삭제에 실패했습니다.");
      }

      setComments((current) => current.filter((item) => item.id !== comment.id));
      setPost((current) => ({
        ...current,
        commentCount: Math.max(current.commentCount - 1, 0),
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 삭제에 실패했습니다.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function deleteCurrentPost() {
    if (!mine) {
      return;
    }

    setDeletingPost(true);

    try {
      const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "포스트 삭제에 실패했습니다.");
      }

      router.push("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스트 삭제에 실패했습니다.");
      setDeletingPost(false);
    }
  }

  async function requestAiJudgement(force = false) {
    if (!signedIn) {
      setMessage("로그인 후 AI 판결을 받을 수 있습니다.");
      return;
    }

    setJudging(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${post.id}/judgements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = (await response.json()) as {
        judgement?: FeedAiJudgement;
        message?: string;
      };

      if (!response.ok || !data.judgement) {
        throw new Error(
          data.message === "OPENAI_API_KEY is not configured"
            ? "서버에 OpenAI API 키가 설정되지 않았습니다."
            : data.message || "AI 판결 생성에 실패했습니다.",
        );
      }

      setPost((current) => ({ ...current, aiJudgement: data.judgement! }));
      setExpandedJudgement(true);
      showBrowserNotification("AI 판결문이 도착했습니다", {
        body: `${post.snackName} 사건의 판결이 내려졌습니다.`,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 판결 생성에 실패했습니다.");
    } finally {
      setJudging(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--jungle-bg)] text-zinc-950">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
        <header className="mb-5 flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-white px-3 text-sm font-black text-[var(--jungle-deep)] ring-1 ring-zinc-200 transition hover:bg-[#e6faf4]"
          >
            <ArrowLeft size={16} />
            피드로 돌아가기
          </Link>
          <div className="flex items-center gap-2 text-xs font-black text-zinc-500">
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200">{voteTotal} 판결표</span>
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200">댓글 {post.commentCount}</span>
          </div>
        </header>

        <article className="grid overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:grid-cols-[76px_minmax(0,1fr)]">
          <aside className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-[#f8f9fa] p-3 lg:flex-col lg:justify-start lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 lg:flex-col">
              <div className="grid size-10 place-items-center rounded-full bg-[var(--jungle-mint)] text-[var(--jungle-deep)]">
                <ArrowUp size={18} />
              </div>
              <div className="text-center">
                <p className="text-lg font-black leading-none">{voteTotal}</p>
                <p className="mt-1 text-[11px] font-black text-zinc-500">판결표</p>
              </div>
            </div>
            <div className="hidden h-px w-full bg-zinc-200 lg:block" />
            <div className="text-center text-[11px] font-black text-zinc-500">
              jungle-snack
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-[var(--surface-muted)] p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar author={post.author} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--text-strong)]">{authorName(post.author)}</p>
                  <p className="text-xs font-semibold text-[var(--text-muted)]">{formatCreatedAt(post.createdAt)}</p>
                </div>
              </div>

              {mine ? (
                <button
                  type="button"
                  onClick={deleteCurrentPost}
                  disabled={deletingPost}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#ad315c] hover:text-[#ad315c] disabled:cursor-wait disabled:opacity-50"
                  aria-label="포스트 삭제"
                >
                  {deletingPost ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              ) : null}
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#e6faf4] px-2.5 py-1 text-[11px] font-black text-[var(--jungle-deep)] ring-1 ring-[#99ebd3]">
                    사건 #{post.id.slice(-4)}
                  </span>
                  {post.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#f3f5fa] px-2.5 py-1 text-[11px] font-black text-zinc-600">
                      #{tag}
                    </span>
                  ))}
                </div>
                <h1 className="mt-3 break-words text-3xl font-black leading-tight text-[var(--jungle-deep)]">
                  {post.snackName}
                </h1>
                <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-zinc-700">
                  {post.reason}
                </p>
              </div>

              <ImageSlider post={post} />
              <MealContext post={post} />

              <section className="rounded-lg border border-zinc-200 bg-[#f8f9fa] p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--jungle-deep)]">
                  <Gavel size={17} />
                  판결 투표
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {voteTypes.map((type) => {
                    const selected = post.myVote === type;

                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => submitVote(type)}
                        disabled={!signedIn || voting}
                        className={`flex min-h-16 flex-col items-start justify-between rounded-lg border px-3 py-2 text-left text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                          selected
                            ? "border-[var(--jungle-green)] bg-[var(--jungle-mint)] text-[var(--jungle-deep)]"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-[var(--jungle-mint)]"
                        }`}
                      >
                        <span>{voteLabels[type]}</span>
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">
                          {post.voteCounts[type] ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-[#ccf5e9] bg-[#f7fcf8] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-black text-[var(--jungle-deep)]">
                      <Sparkles size={17} />
                      AI 판결
                    </div>
                    {post.aiJudgement ? (
                      <>
                        <span
                          className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${aiVerdictStyles[post.aiJudgement.verdict]}`}
                        >
                          {aiVerdictLabels[post.aiJudgement.verdict]}
                        </span>
                        <p className="mt-2 text-sm font-semibold leading-6 text-zinc-700">
                          {post.aiJudgement.summary}
                        </p>
                        <AiEvidenceSummary evidence={post.aiJudgement.evidence} />
                      </>
                    ) : (
                      <p className="mt-2 text-sm font-semibold text-zinc-500">
                        아직 AI 판결문이 없습니다.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestAiJudgement(Boolean(post.aiJudgement && mine))}
                    disabled={!signedIn || judging}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--jungle-green)] bg-white px-3 text-sm font-black text-[var(--jungle-deep)] transition hover:bg-[#e6faf4] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {judging ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {post.aiJudgement && mine ? "AI 재판결" : "AI 판결 받기"}
                  </button>
                </div>

                {post.aiJudgement ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedJudgement((current) => !current)}
                      className="text-xs font-black text-[var(--jungle-purple)]"
                    >
                      {expandedJudgement ? "판결문 접기" : "판결문 자세히 보기"}
                    </button>
                    {expandedJudgement ? (
                      <div className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-zinc-700 ring-1 ring-zinc-200">
                        <p className="font-black text-zinc-950">이유</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{post.aiJudgement.reasoning}</p>
                        {post.aiJudgement.recommendation ? (
                          <>
                            <p className="mt-3 font-black text-zinc-950">권고</p>
                            <p className="mt-1 whitespace-pre-wrap break-words">{post.aiJudgement.recommendation}</p>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-black text-[var(--jungle-deep)]">
                    <MessageCircle size={17} />
                    전체 댓글
                  </div>
                  <span className="rounded-full bg-[#f3f5fa] px-2.5 py-1 text-xs font-black text-zinc-500">
                    {comments.length}개
                  </span>
                </div>

                <form onSubmit={submitComment} className="mb-4 flex gap-2">
                  <input
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    disabled={!signedIn || submittingComment}
                    placeholder={signedIn ? "판결 사유를 댓글로 남겨주세요" : "로그인 후 댓글을 쓸 수 있습니다"}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 text-sm outline-none transition focus:border-[var(--jungle-mint)] focus:bg-white focus:ring-2 focus:ring-[#05d18233] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!signedIn || submittingComment || !commentDraft.trim()}
                    className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--jungle-deep)] text-white transition hover:bg-[#025334] disabled:cursor-not-allowed disabled:bg-zinc-300"
                    aria-label="댓글 작성"
                  >
                    {submittingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>

                {comments.length ? (
                  <div>
                    {comments.map((comment) => (
                      <CommentRow
                        key={comment.id}
                        comment={comment}
                        currentUserId={initialSession?.user?.id}
                        busyLike={likingCommentId === comment.id}
                        busyDelete={deletingCommentId === comment.id}
                        onLike={toggleCommentLike}
                        onDelete={deleteComment}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-[#f8f9fa] px-3 py-6 text-center text-sm font-semibold text-zinc-500">
                    아직 댓글이 없습니다. 첫 증언을 남겨보세요.
                  </div>
                )}
              </section>

              {message ? (
                <div className="rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 py-2 text-sm font-semibold text-zinc-700">
                  {message}
                </div>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
