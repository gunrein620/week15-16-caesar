"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowUp,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Gavel,
  Heart,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Quote,
  ReceiptText,
  Search,
  Scale,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import { showBrowserNotification } from "@/lib/browser-notifications";
import { AiEvidenceSummary } from "@/components/ai-evidence-summary";
import type { FeedMealMenu } from "@/types/meal";
import type {
  FeedAiJudgement,
  FeedAuthor,
  FeedComment,
  FeedImage,
  FeedPost,
  InitialSession,
  SnackAiVerdict,
  SnackVoteType,
  VoteCounts,
} from "@/types/post";
import { voteTypes } from "@/types/post";
import type { OAuthProviderId } from "@/lib/oauth-provider-status";

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
  NEEDS_MORE_CONTEXT: "AI 추가 정황 필요",
};

const aiVerdictStyles: Record<SnackAiVerdict, string> = {
  INNOCENT: "bg-[#e7f8ef] text-[#10674f] ring-[#9ad9c2]",
  PROBATION: "bg-[#fff4cf] text-[#8a5b00] ring-[#f1cf73]",
  GUILTY_BUT_UNDERSTANDABLE: "bg-[#fff0f5] text-[#ad315c] ring-[#f3a9bf]",
  NEEDS_MORE_CONTEXT: "bg-[#eef2ff] text-[#3345a3] ring-[#b8c2ff]",
};

type SnackCourtAppProps = {
  initialSession: InitialSession;
};

const loginProviders = [
  {
    id: "naver" as const,
    label: "네이버",
    className: "border-[#03c75a] bg-[#03c75a] text-white hover:bg-[#02b351]",
  },
  {
    id: "kakao" as const,
    label: "카카오",
    className: "border-[#f6d84f] bg-[#fee84d] text-[#371d1e] hover:bg-[#f7df47]",
  },
  {
    id: "google" as const,
    label: "구글",
    className: "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
  },
];

type ProviderStatusResponse = {
  providers?: Array<{
    id: OAuthProviderId;
    configured: boolean;
  }>;
};

function authorName(author: FeedAuthor) {
  return author.name || author.email || "익명의 정글러";
}

function avatarInitial(author: FeedAuthor) {
  return authorName(author).slice(0, 1).toUpperCase();
}

function Avatar({ author, size = "md" }: { author: FeedAuthor; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-9" : "size-12";
  const [imageFailed, setImageFailed] = useState(false);

  if (author.image && !imageFailed) {
    return (
      <img
        src={author.image}
        alt={`${authorName(author)} 프로필`}
        className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm`}
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-[#1d8a6b] text-sm font-bold text-white shadow-sm`}
    >
      {avatarInitial(author)}
    </div>
  );
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

const feedDateKeyFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Seoul",
});

const feedDateTitleFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "Asia/Seoul",
});

const feedTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

type FeedDateGroup = {
  key: string;
  title: string;
  dateText: string;
  posts: FeedPost[];
};

type FeedTab = "main" | "precedents";

type WeeklyFeedDateGroup = FeedDateGroup & {
  isToday: boolean;
};

function feedDateKey(date: Date) {
  const parts = Object.fromEntries(
    feedDateKeyFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatFeedDateTitle(date: Date, referenceDate = new Date()) {
  const key = feedDateKey(date);
  const todayKey = feedDateKey(referenceDate);
  const yesterdayKey = feedDateKey(new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000));

  if (key === todayKey) {
    return "오늘";
  }

  if (key === yesterdayKey) {
    return "어제";
  }

  return feedDateTitleFormatter.format(date);
}

function koreanWeekdayIndex(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function formatFeedTime(value: string) {
  return feedTimeFormatter.format(new Date(value));
}

function groupPostsByDate(posts: FeedPost[], referenceDate = new Date()) {
  const groups: FeedDateGroup[] = [];
  const groupByKey = new Map<string, FeedDateGroup>();

  posts.forEach((post) => {
    const date = new Date(post.createdAt);
    const key = feedDateKey(date);
    const existing = groupByKey.get(key);

    if (existing) {
      existing.posts.push(post);
      return;
    }

    const nextGroup = {
      key,
      title: formatFeedDateTitle(date, referenceDate),
      dateText: feedDateTitleFormatter.format(date),
      posts: [post],
    };

    groups.push(nextGroup);
    groupByKey.set(key, nextGroup);
  });

  return groups;
}

function buildWeeklyMainGroups(posts: FeedPost[], referenceDate = new Date()) {
  const today = referenceDate;
  const todayKey = feedDateKey(today);
  const daysUntilSunday = Math.max(0, 6 - koreanWeekdayIndex(today));
  const groupedPosts = groupPostsByDate(posts, referenceDate);
  const postsByDateKey = new Map(groupedPosts.map((group) => [group.key, group.posts]));

  return Array.from({ length: daysUntilSunday + 1 }, (_, index): WeeklyFeedDateGroup => {
    const date = new Date(today.getTime() + index * 24 * 60 * 60 * 1000);
    const key = feedDateKey(date);

    return {
      key,
      title: key === todayKey ? "오늘" : feedDateTitleFormatter.format(date),
      dateText: feedDateTitleFormatter.format(date),
      posts: postsByDateKey.get(key) ?? [],
      isToday: key === todayKey,
    };
  });
}

function buildPrecedentGroups(posts: FeedPost[], referenceDate = new Date()) {
  const todayKey = feedDateKey(referenceDate);

  return groupPostsByDate(
    posts.filter((post) => feedDateKey(new Date(post.createdAt)) < todayKey),
    referenceDate,
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesPostSearch(post: FeedPost, query: string) {
  const mealContext = post.mealContext;
  const searchableText = [
    post.snackName,
    post.reason,
    authorName(post.author),
    post.author.email,
    formatFeedDateTitle(new Date(post.createdAt)),
    formatCreatedAt(post.createdAt),
    ...post.tags,
    mealContext?.mealNote,
    mealContext?.lunchMenu?.menuText,
    mealContext?.dinnerMenu?.menuText,
    mealContext?.lunchMenu ? mealTypeLabel(mealContext.lunchMenu.mealType) : null,
    mealContext?.dinnerMenu ? mealTypeLabel(mealContext.dinnerMenu.mealType) : null,
    post.aiJudgement ? aiVerdictLabels[post.aiJudgement.verdict] : null,
    post.aiJudgement?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function formatMealDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function mealTypeLabel(type: FeedMealMenu["mealType"]) {
  return type === "LUNCH" ? "중식" : "석식";
}

function totalVoteCount(counts: VoteCounts) {
  return voteTypes.reduce((total, type) => total + (counts[type] ?? 0), 0);
}

function mealStateLabel(label: string, value: boolean) {
  return `${label} ${value ? "완료" : "패스"}`;
}

function MealSummaryCard({
  meal,
  removable = false,
  onRemove,
}: {
  meal: FeedMealMenu;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#cde7d8] bg-[#f6fbf7] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#10674f] ring-1 ring-[#b9e5d7]">
              <CalendarDays size={14} />
              {mealTypeLabel(meal.mealType)}
            </span>
            <span className="min-w-0 text-sm font-black text-zinc-800">
              {formatMealDate(meal.mealDate)}
            </span>
          </div>
          {meal.menuText ? (
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
              {meal.menuText}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-zinc-500">
              메뉴 텍스트가 아직 공개되지 않았습니다.
            </p>
          )}
          {meal.imageUrl ? (
            <a
              href={meal.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-black text-[#1d8a6b] ring-1 ring-zinc-200 transition hover:bg-[#effbf6]"
            >
              <ExternalLink size={13} />
              식단 이미지 보기
            </a>
          ) : null}
        </div>

        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#ef6486] hover:text-[#d93663] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef6486]"
            aria-label="첨부 식단 제거"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PostMealContextView({ post }: { post: FeedPost }) {
  const meals = [post.mealContext?.lunchMenu, post.mealContext?.dinnerMenu].filter(
    (meal): meal is FeedMealMenu => Boolean(meal),
  );

  if (!meals.length) {
    return null;
  }

  return (
    <section className="mt-4 space-y-2 rounded-lg border border-[#e3eadf] bg-[#fbfcf8] p-3">
      <div className="flex items-center gap-2 text-xs font-black text-[#10674f]">
        <ReceiptText size={15} />
        식단 맥락
      </div>
      {meals.map((meal) => (
        <MealSummaryCard key={meal.id} meal={meal} />
      ))}
    </section>
  );
}

function sortHighlightComments(comments: FeedComment[]) {
  return [...comments]
    .sort((a, b) => {
      if (b.likeCount !== a.likeCount) {
        return b.likeCount - a.likeCount;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, 2);
}

function ImageSlider({ images, snackName }: { images: FeedImage[]; snackName: string }) {
  const [index, setIndex] = useState(0);
  const hasControls = images.length > 1;

  if (!images.length) {
    return null;
  }

  const currentIndex = Math.min(index, images.length - 1);
  const image = images[currentIndex];

  return (
    <div className="relative mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 shadow-sm">
      <div className="aspect-[4/3] w-full">
        <img
          src={image.url}
          alt={image.altText ?? `${snackName} 사진`}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/70 px-2.5 py-1 text-xs font-black text-white backdrop-blur">
        <Camera size={13} />
        증거 {currentIndex + 1}/{images.length}
      </div>

      {hasControls ? (
        <>
          <button
            type="button"
            aria-label="이전 이미지"
            onClick={() =>
              setIndex((current) => (current <= 0 ? images.length - 1 : current - 1))
            }
            className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-800 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="다음 이미지"
            onClick={() => setIndex((current) => (current + 1) % images.length)}
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-800 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {images.map((item, dotIndex) => (
              <button
                type="button"
                aria-label={`${dotIndex + 1}번 이미지`}
                key={item.id}
                onClick={() => setIndex(dotIndex)}
                className={`h-2 rounded-full transition ${
                  dotIndex === currentIndex ? "w-5 bg-white" : "w-2 bg-white/45"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function VotePanel({
  post,
  signedIn,
  voting,
  onVote,
}: {
  post: FeedPost;
  signedIn: boolean;
  voting: boolean;
  onVote: (postId: string, type: SnackVoteType) => void;
}) {
  const voteTotal = totalVoteCount(post.voteCounts);

  return (
    <section className="mt-5 border-t border-dashed border-zinc-200 pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-zinc-800">
          <Gavel size={17} />
          판결 투표
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-600">
          {voteTotal}표
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {voteTypes.map((type) => {
          const selected = post.myVote === type;
          const count = post.voteCounts[type] ?? 0;

          return (
            <button
              type="button"
              key={type}
              disabled={!signedIn || voting}
              onClick={() => onVote(post.id, type)}
              className={`flex min-h-16 flex-col items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                selected
                  ? "border-[#1d8a6b] bg-[#e8f8ef] text-[#10674f] shadow-sm"
                  : "border-zinc-200 bg-[#fbfbf8] text-zinc-700 hover:border-[#86d1bb] hover:bg-white"
              }`}
            >
              <span className="min-w-0 break-keep leading-4">{voteLabels[type]}</span>
              <span
                className={`grid min-w-7 place-items-center rounded-full px-2 py-0.5 text-[11px] ${
                  selected ? "bg-[#1d8a6b] text-white" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!signedIn ? (
        <p className="mt-2 text-xs font-semibold text-zinc-500">로그인 후 판결에 참여할 수 있습니다.</p>
      ) : null}
    </section>
  );
}

function AiJudgementPanel({
  post,
  judgement,
  signedIn,
  mine,
  busy,
  expanded,
  message,
  onRequest,
  onToggleExpanded,
}: {
  post: FeedPost;
  judgement: FeedAiJudgement | null;
  signedIn: boolean;
  mine: boolean;
  busy: boolean;
  expanded: boolean;
  message?: string;
  onRequest: (post: FeedPost, force?: boolean) => void;
  onToggleExpanded: () => void;
}) {
  return (
    <section className="mt-4 rounded-lg border border-[#d8eadf] bg-[linear-gradient(135deg,#f7fcf8,#fffaf0)] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-[#10674f]">
            <Sparkles size={17} />
            AI 판결
          </div>

          {judgement ? (
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${aiVerdictStyles[judgement.verdict]}`}
              >
                {aiVerdictLabels[judgement.verdict]}
              </span>
              {judgement.title ? (
                <p className="mt-2 text-sm font-black text-zinc-900">{judgement.title}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                {judgement.summary}
              </p>
              <AiEvidenceSummary evidence={judgement.evidence} />

              {expanded ? (
                <div className="mt-3 space-y-2 rounded-lg border border-white/80 bg-white/80 p-3 text-sm leading-6 text-zinc-700 shadow-sm">
                  <p className="whitespace-pre-wrap break-words">{judgement.reasoning}</p>
                  {judgement.recommendation ? (
                    <p className="font-semibold text-[#8a5b00]">
                      권고: {judgement.recommendation}
                    </p>
                  ) : null}
                  {typeof judgement.confidence === "number" ? (
                    <p className="text-xs font-bold text-zinc-500">
                      신뢰도 {Math.round(judgement.confidence * 100)}%
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              아직 판결문이 없습니다. 사건을 정글 법정에 올려보세요.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {judgement ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="min-h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
            >
              {expanded ? "자세한 판결문 접기" : "자세한 판결문 펼치기"}
            </button>
          ) : null}

          {!judgement || mine ? (
            <button
              type="button"
              disabled={!signedIn || busy}
              onClick={() => onRequest(post, Boolean(judgement))}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#1d8a6b] bg-white px-3 text-xs font-black text-[#10674f] transition hover:bg-[#effbf6] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {judgement ? "AI 재판결" : "AI 판결 받기"}
            </button>
          ) : null}
        </div>
      </div>

      {!signedIn ? (
        <p className="mt-3 text-xs font-semibold text-zinc-500">로그인 후 AI 판결을 받을 수 있습니다.</p>
      ) : null}

      {message ? <p className="mt-3 text-xs font-bold text-[#ad315c]">{message}</p> : null}
    </section>
  );
}

function CommentItem({
  comment,
  currentUserId,
  likeBusy,
  deleteBusy,
  onToggleLike,
  onDelete,
}: {
  comment: FeedComment;
  currentUserId?: string;
  likeBusy: boolean;
  deleteBusy: boolean;
  onToggleLike: (comment: FeedComment) => void;
  onDelete: (comment: FeedComment) => void;
}) {
  const mine = currentUserId === comment.author.id;

  return (
    <div className="flex gap-3 border-t border-zinc-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <Avatar author={comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-black">{authorName(comment.author)}</p>
          <p className="text-xs font-semibold text-zinc-500">
            {formatCreatedAt(comment.createdAt)}
          </p>
        </div>
        <div className="mt-1 flex gap-2">
          <Quote size={15} className="mt-1 shrink-0 text-[#ef6486]" />
          <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
            {comment.content}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleLike(comment)}
            disabled={!currentUserId || likeBusy}
            className={`flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              comment.myLiked
                ? "border-[#ef6486] bg-[#fff0f5] text-[#d93663]"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {likeBusy ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />}
            {comment.likeCount}
          </button>

          {mine ? (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              disabled={deleteBusy}
              className="flex min-h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-bold text-zinc-500 transition hover:border-[#ef6486] hover:text-[#d93663] disabled:cursor-wait disabled:opacity-50"
            >
              {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              삭제
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function SnackCourtApp({ initialSession }: SnackCourtAppProps) {
  const [session] = useState(initialSession);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [votingPostId, setVotingPostId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({});
  const [loadingCommentsId, setLoadingCommentsId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const [judgingPostId, setJudgingPostId] = useState<string | null>(null);
  const [expandedJudgements, setExpandedJudgements] = useState<Record<string, boolean>>({});
  const [aiMessagesByPost, setAiMessagesByPost] = useState<Record<string, string>>({});
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>("main");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedReferenceDate, setFeedReferenceDate] = useState(() => new Date());
  const [providerStatusById, setProviderStatusById] =
    useState<Record<OAuthProviderId, boolean> | null>(null);

  const signedIn = Boolean(session?.user?.id);
  const normalizedSearchQuery = normalizeSearch(searchQuery);
  const filteredPosts = normalizedSearchQuery
    ? posts.filter((post) => matchesPostSearch(post, normalizedSearchQuery))
    : posts;
  const weeklyMainGroups = buildWeeklyMainGroups(filteredPosts, feedReferenceDate);
  const precedentGroups = buildPrecedentGroups(filteredPosts, feedReferenceDate);
  const visibleGroups = activeFeedTab === "main" ? weeklyMainGroups : precedentGroups;
  const renderedGroups =
    normalizedSearchQuery && activeFeedTab === "main"
      ? visibleGroups.filter((group) => group.posts.length > 0)
      : visibleGroups;
  const todayAndRemainingPostCount = weeklyMainGroups.reduce(
    (total, group) => total + group.posts.length,
    0,
  );
  const precedentPostCount = precedentGroups.reduce((total, group) => total + group.posts.length, 0);

  useEffect(() => {
    let active = true;

    async function loadPosts() {
      setLoadingPosts(true);
      try {
        const response = await fetch("/api/posts", { cache: "no-store" });
        const data = (await response.json()) as { posts?: FeedPost[]; message?: string };

        if (!response.ok) {
          throw new Error(data.message || "피드를 불러오지 못했습니다.");
        }

        if (active) {
          setPosts(data.posts ?? []);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "피드를 불러오지 못했습니다.");
        }
      } finally {
        if (active) {
          setLoadingPosts(false);
        }
      }
    }

    loadPosts();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextDate = new Date();

      setFeedReferenceDate((currentDate) =>
        feedDateKey(currentDate) === feedDateKey(nextDate) ? currentDate : nextDate,
      );
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!loginModalOpen || providerStatusById) {
      return;
    }

    let active = true;

    async function loadProviderStatus() {
      try {
        const response = await fetch("/api/auth/provider-status", { cache: "no-store" });
        const data = (await response.json()) as ProviderStatusResponse;
        const nextStatus = Object.fromEntries(
          loginProviders.map((provider) => [
            provider.id,
            Boolean(data.providers?.find((item) => item.id === provider.id)?.configured),
          ]),
        ) as Record<OAuthProviderId, boolean>;

        if (active) {
          setProviderStatusById(nextStatus);
        }
      } catch {
        if (active) {
          setProviderStatusById({
            naver: false,
            kakao: false,
            google: false,
          });
        }
      }
    }

    loadProviderStatus();

    return () => {
      active = false;
    };
  }, [loginModalOpen, providerStatusById]);

  function updatePostCommentSummary(postId: string, comments: FeedComment[]) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              commentCount: comments.length,
              highlightComments: sortHighlightComments(comments),
            }
          : post,
      ),
    );
  }

  function updateHighlightComment(postId: string, commentId: string, patch: Partial<FeedComment>) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              highlightComments: sortHighlightComments(
                post.highlightComments.map((comment) =>
                  comment.id === commentId ? { ...comment, ...patch } : comment,
                ),
              ),
            }
          : post,
      ),
    );
  }

  async function deletePost(id: string) {
    if (!confirm("이 간식 기록을 삭제할까요?")) {
      return;
    }

    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "삭제에 실패했습니다.");
      }

      setPosts((current) => current.filter((post) => post.id !== id));
      setMessage("기록을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function submitVote(postId: string, type: SnackVoteType) {
    if (!signedIn) {
      setMessage("로그인 후 판결할 수 있습니다.");
      return;
    }

    setVotingPostId(postId);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${postId}/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });
      const data = (await response.json()) as {
        voteCounts?: VoteCounts;
        myVote?: SnackVoteType | null;
        message?: string;
      };

      if (!response.ok || !data.voteCounts) {
        throw new Error(data.message || "판결 투표에 실패했습니다.");
      }

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                voteCounts: data.voteCounts!,
                myVote: data.myVote ?? null,
              }
            : post,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "판결 투표에 실패했습니다.");
    } finally {
      setVotingPostId(null);
    }
  }

  function setPostAiMessage(postId: string, nextMessage: string | null) {
    setAiMessagesByPost((current) => {
      const next = { ...current };

      if (nextMessage) {
        next[postId] = nextMessage;
      } else {
        delete next[postId];
      }

      return next;
    });
  }

  function updatePostAiJudgement(postId: string, judgement: FeedAiJudgement) {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, aiJudgement: judgement } : post)),
    );
  }

  async function requestAiJudgement(post: FeedPost, force = false) {
    if (!signedIn) {
      setPostAiMessage(post.id, "로그인 후 AI 판결을 받을 수 있습니다.");
      return;
    }

    setJudgingPostId(post.id);
    setPostAiMessage(post.id, null);

    try {
      const response = await fetch(`/api/posts/${post.id}/judgements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      });
      const data = (await response.json()) as {
        judgement?: FeedAiJudgement;
        code?: string;
        message?: string;
      };

      if (!response.ok || !data.judgement) {
        if (data.code === "OPENAI_NOT_CONFIGURED") {
          throw new Error("서버에 OpenAI API 키가 설정되지 않았습니다.");
        }

        throw new Error(data.message || "AI 판결 생성에 실패했습니다.");
      }

      updatePostAiJudgement(post.id, data.judgement);
      setExpandedJudgements((current) => ({
        ...current,
        [post.id]: true,
      }));
      showBrowserNotification("AI 판결문이 도착했습니다", {
        body: `${post.snackName} 사건의 판결이 내려졌습니다.`,
      });
    } catch (error) {
      setPostAiMessage(
        post.id,
        error instanceof Error ? error.message : "AI 판결 생성에 실패했습니다.",
      );
    } finally {
      setJudgingPostId(null);
    }
  }

  async function loadComments(postId: string) {
    setLoadingCommentsId(postId);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, { cache: "no-store" });
      const data = (await response.json()) as { comments?: FeedComment[]; message?: string };

      if (!response.ok || !data.comments) {
        throw new Error(data.message || "댓글을 불러오지 못했습니다.");
      }

      setCommentsByPost((current) => ({
        ...current,
        [postId]: data.comments!,
      }));
      updatePostCommentSummary(postId, data.comments);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글을 불러오지 못했습니다.");
    } finally {
      setLoadingCommentsId(null);
    }
  }

  async function toggleComments(postId: string) {
    const nextOpen = !openComments[postId];
    setOpenComments((current) => ({
      ...current,
      [postId]: nextOpen,
    }));

    if (nextOpen && !commentsByPost[postId]) {
      await loadComments(postId);
    }
  }

  async function submitComment(postId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signedIn) {
      setMessage("로그인 후 댓글을 쓸 수 있습니다.");
      return;
    }

    const content = (commentDrafts[postId] ?? "").trim();
    if (!content) {
      setMessage("댓글 내용을 적어주세요.");
      return;
    }

    setSubmittingCommentId(postId);
    setMessage(null);

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json()) as { comment?: FeedComment; message?: string };

      if (!response.ok || !data.comment) {
        throw new Error(data.message || "댓글 작성에 실패했습니다.");
      }

      const nextComments = [data.comment, ...(commentsByPost[postId] ?? [])];
      setCommentsByPost((current) => ({
        ...current,
        [postId]: nextComments,
      }));
      setCommentDrafts((current) => ({
        ...current,
        [postId]: "",
      }));
      updatePostCommentSummary(postId, nextComments);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 작성에 실패했습니다.");
    } finally {
      setSubmittingCommentId(null);
    }
  }

  async function deleteComment(postId: string, comment: FeedComment) {
    if (!confirm("이 댓글을 삭제할까요?")) {
      return;
    }

    setDeletingCommentId(comment.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/comments/${comment.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "댓글 삭제에 실패했습니다.");
      }

      const loadedComments = commentsByPost[postId];
      if (loadedComments) {
        const nextComments = loadedComments.filter((item) => item.id !== comment.id);
        setCommentsByPost((current) => ({
          ...current,
          [postId]: nextComments,
        }));
        updatePostCommentSummary(postId, nextComments);
      } else {
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  commentCount: Math.max(post.commentCount - 1, 0),
                  highlightComments: post.highlightComments.filter(
                    (item) => item.id !== comment.id,
                  ),
                }
              : post,
          ),
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 삭제에 실패했습니다.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function toggleCommentLike(postId: string, comment: FeedComment) {
    if (!signedIn) {
      setMessage("로그인 후 댓글에 좋아요를 누를 수 있습니다.");
      return;
    }

    setLikingCommentId(comment.id);
    setMessage(null);

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

      const patch = {
        likeCount: data.likeCount,
        myLiked: Boolean(data.myLiked),
      };
      const loadedComments = commentsByPost[postId];

      if (loadedComments) {
        const nextComments = loadedComments.map((item) =>
          item.id === data.commentId ? { ...item, ...patch } : item,
        );
        setCommentsByPost((current) => ({
          ...current,
          [postId]: nextComments,
        }));
        updatePostCommentSummary(postId, nextComments);
      } else {
        updateHighlightComment(postId, data.commentId, patch);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 좋아요 처리에 실패했습니다.");
    } finally {
      setLikingCommentId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--jungle-bg)] text-zinc-950">
      {loginModalOpen && !signedIn ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 px-4 py-5 backdrop-blur-sm sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setLoginModalOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#1d8a6b]">
                  Social Login
                </p>
                <h2 id="login-modal-title" className="mt-1 text-xl font-black text-zinc-950">
                  로그인 선택
                </h2>
                <p className="mt-1 text-sm font-semibold text-zinc-500">
                  사용할 계정으로 간식 재판소에 입장하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                aria-label="로그인 모달 닫기"
                title="닫기"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {loginProviders.map((provider) => {
                const statusLoaded = providerStatusById !== null;
                const configured = Boolean(providerStatusById?.[provider.id]);

                return (
                  <button
                    type="button"
                    key={provider.id}
                    disabled={!configured}
                    onClick={() => {
                      if (!configured) {
                        return;
                      }

                      setLoginModalOpen(false);
                      signIn(provider.id, { callbackUrl: "/" });
                    }}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b] ${configured ? provider.className : ""}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LogIn size={17} />
                      {provider.label} 로그인
                    </span>
                    {!configured ? (
                      <span className="text-xs font-bold">
                        {statusLoaded ? "환경변수 필요" : "확인 중"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs font-semibold leading-5 text-zinc-500">
              OAuth 키가 아직 placeholder이면 외부 로그인 페이지로 이동하지 않습니다. 실제
              Client ID와 Secret을 `.env.local`에 넣은 뒤 서버를 다시 시작하세요.
            </p>
          </section>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:py-6">
        <header className="border-b border-zinc-200/80 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <img
              src="/brand/snack-court-icon.png"
              alt="정글 간식 재판소"
              className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
            />
            <h1 className="text-2xl font-black tracking-normal text-zinc-950 sm:text-3xl">
              정글 간식 재판소
            </h1>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Link
              href="/posts/new"
              className="hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--jungle-deep)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#025334] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jungle-mint)]"
            >
              <Send size={16} />
              포스트 작성하기
            </Link>

            {signedIn && session?.user ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white/85 p-2 shadow-sm sm:min-w-72">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar author={session.user} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{authorName(session.user)}</p>
                    <p className="truncate text-xs text-zinc-500">{session.user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                  aria-label="로그아웃"
                  title="로그아웃"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-900 bg-zinc-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
              >
                <LogIn size={16} />
                로그인
              </button>
            )}
          </div>
          </div>

        </header>

        <section className="mx-auto w-full max-w-[760px]">
          <section className="min-w-0 space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#e6faf4] px-3 py-1 text-xs font-black text-[var(--jungle-deep)] ring-1 ring-[#99ebd3]">
                    <CalendarDays size={14} />
                    주간 사건판
                  </div>
                  <h2 className="mt-2 text-xl font-black text-[var(--jungle-deep)]">
                    오늘부터 이번 주 남은 간식 사건
                  </h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">
                    진행 중인 사건은 메인에서 보고, 지난 사건은 판례로 넘겨서 봅니다.
                  </p>
                </div>
                <Link
                  href="/posts/new"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--jungle-mint)] px-4 text-sm font-black text-[#09323d] shadow-sm ring-1 ring-[#02b86f]/35 transition hover:bg-[var(--jungle-green)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jungle-mint)]"
                >
                  <Send size={16} />
                  사건 접수
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveFeedTab("main")}
                  className={`min-h-10 rounded-md px-3 text-sm font-black transition ${
                    activeFeedTab === "main"
                      ? "bg-white text-[var(--jungle-deep)] shadow-sm"
                      : "text-zinc-500 hover:bg-white/70"
                  }`}
                >
                  메인
                  <span className="ml-1 text-xs font-bold text-zinc-400">
                    {todayAndRemainingPostCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFeedTab("precedents")}
                  className={`min-h-10 rounded-md px-3 text-sm font-black transition ${
                    activeFeedTab === "precedents"
                      ? "bg-white text-[var(--jungle-deep)] shadow-sm"
                      : "text-zinc-500 hover:bg-white/70"
                  }`}
                >
                  판례
                  <span className="ml-1 text-xs font-bold text-zinc-400">
                    {precedentPostCount}
                  </span>
                </button>
              </div>
              <div className="mt-3">
                <label htmlFor="post-search" className="sr-only">
                  포스트 검색
                </label>
                <div className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 shadow-sm focus-within:border-[var(--jungle-mint)] focus-within:ring-2 focus-within:ring-[var(--jungle-mint)]/20">
                  <Search size={17} className="shrink-0 text-zinc-400" />
                  <input
                    id="post-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="간식명, 변명, 태그, 작성자로 검색"
                    className="min-h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                      aria-label="검색어 지우기"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
                {normalizedSearchQuery ? (
                  <p className="mt-2 text-xs font-semibold text-zinc-500">
                    검색 결과 {filteredPosts.length}건 중 메인 {todayAndRemainingPostCount}건,
                    판례 {precedentPostCount}건
                  </p>
                ) : null}
              </div>
            </div>

            {message ? (
              <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
                {message}
              </div>
            ) : null}

            {loadingPosts ? (
              <div className="grid min-h-48 place-items-center rounded border border-zinc-200 bg-white text-zinc-500 shadow-sm">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : null}

            {!loadingPosts && normalizedSearchQuery && renderedGroups.length === 0 ? (
              <div className="rounded border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <p className="text-base font-black text-[var(--jungle-deep)]">
                  검색 결과가 없습니다.
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  다른 간식명, 태그, 작성자 이름으로 다시 찾아보세요.
                </p>
              </div>
            ) : null}

            {!loadingPosts &&
            !normalizedSearchQuery &&
            activeFeedTab === "precedents" &&
            renderedGroups.length === 0 ? (
              <div className="rounded border border-zinc-200 bg-white p-8 text-center shadow-sm">
                <p className="text-base font-black text-[var(--jungle-deep)]">
                  아직 판례로 넘어간 사건이 없습니다.
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  오늘 이전에 접수된 사건이 생기면 이곳에 모입니다.
                </p>
              </div>
            ) : null}

            {renderedGroups.map((group) => {
              const mealContextCount = group.posts.filter((post) => post.mealContext).length;
              const isWeeklyToday = "isToday" in group && group.isToday;

              return (
                <section key={group.key} className="space-y-3">
                  <div className="sticky top-0 z-10 -mx-1 bg-[var(--jungle-bg)]/90 px-1 py-2 backdrop-blur">
                    <div className="flex items-end justify-between gap-3 border-b border-zinc-200 pb-2">
                      <div>
                        <h3 className="text-xl font-black text-[var(--jungle-deep)]">
                          {group.title}
                        </h3>
                        <p className="text-xs font-bold text-zinc-500">
                          {activeFeedTab === "main" && isWeeklyToday
                            ? group.dateText
                            : activeFeedTab === "main"
                              ? "이번 주 남은 사건판"
                              : group.title === group.dateText
                                ? "지난 간식 판례"
                                : group.dateText}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-xs font-black">
                        <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600 ring-1 ring-zinc-200">
                          {group.posts.length}건
                        </span>
                        {mealContextCount > 0 ? (
                          <span className="rounded-full bg-[#e6faf4] px-2.5 py-1 text-[var(--jungle-deep)] ring-1 ring-[#99ebd3]">
                            식단 {mealContextCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {group.posts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 p-5 text-sm font-semibold text-zinc-500">
                      {isWeeklyToday
                        ? "오늘은 아직 접수된 간식 사건이 없습니다."
                        : "아직 이 날짜에 접수된 사건이 없습니다."}
                    </div>
                  ) : (
                  <div className="space-y-3">
                    {group.posts.map((post) => {
                      const voteTotal = totalVoteCount(post.voteCounts);
                      const mine = session?.user?.id === post.author.id;
                      const primaryImage = post.images[0];

                      return (
                        <article
                          key={post.id}
                          className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-[var(--jungle-mint)]"
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar author={post.author} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-zinc-900">
                                    {authorName(post.author)}
                                  </p>
                                  <p className="text-xs font-semibold text-zinc-500">
                                    {formatFeedTime(post.createdAt)}
                                  </p>
                                </div>
                              </div>
                              {post.aiJudgement ? (
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${aiVerdictStyles[post.aiJudgement.verdict]}`}
                                >
                                  {aiVerdictLabels[post.aiJudgement.verdict]}
                                </span>
                              ) : null}
                            </div>

                            <Link href={`/posts/${post.id}`} className="group mt-3 block">
                              <h4 className="break-words text-xl font-black leading-snug text-zinc-950 group-hover:text-[var(--jungle-green)]">
                                {post.snackName}
                              </h4>
                            </Link>

                            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_156px]">
                              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                                {post.reason}
                              </p>
                              {primaryImage ? (
                                <Link
                                  href={`/posts/${post.id}`}
                                  className="relative block aspect-video overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 sm:aspect-square"
                                >
                                  <img
                                    src={primaryImage.url}
                                    alt={`${post.snackName} 증거 사진`}
                                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                  />
                                  {post.images.length > 1 ? (
                                    <span className="absolute bottom-2 right-2 rounded-full bg-zinc-950/75 px-2 py-1 text-[10px] font-black text-white">
                                      +{post.images.length - 1}
                                    </span>
                                  ) : null}
                                </Link>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                              <span className="rounded-full bg-[#e6faf4] px-2.5 py-1 text-[var(--jungle-deep)]">
                                점심 {post.ateLunch ? "완료" : "패스"}
                              </span>
                              <span className="rounded-full bg-[#eef0ff] px-2.5 py-1 text-[var(--jungle-purple)]">
                                저녁 {post.ateDinner ? "완료" : "패스"}
                              </span>
                              {post.mealContext ? (
                                <span className="rounded-full bg-[#fff4cf] px-2.5 py-1 text-[#8a5b00]">
                                  식단 첨부
                                </span>
                              ) : null}
                              {post.tags.slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-[#f3f5fa] px-2.5 py-1 text-zinc-600"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-1 text-xs font-black text-zinc-500">
                              <Link
                                href={`/posts/${post.id}`}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 transition hover:bg-zinc-100"
                              >
                                <Gavel size={15} />
                                판결 {voteTotal}표
                              </Link>
                              <Link
                                href={`/posts/${post.id}`}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 transition hover:bg-zinc-100"
                              >
                                <MessageCircle size={15} />
                                댓글 {post.commentCount}
                              </Link>
                              <Link
                                href={`/posts/${post.id}`}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 transition hover:bg-zinc-100"
                              >
                                <Sparkles size={15} />
                                {post.aiJudgement ? "AI 판결문" : "AI 판결"}
                              </Link>
                              <Link
                                href={`/posts/${post.id}`}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[var(--jungle-deep)] transition hover:bg-[#e6faf4]"
                              >
                                자세히 보기
                              </Link>
                              {mine ? (
                                <button
                                  type="button"
                                  onClick={() => deletePost(post.id)}
                                  disabled={deletingId === post.id}
                                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 transition hover:bg-zinc-100 hover:text-[#ad315c] disabled:cursor-wait disabled:opacity-50"
                                >
                                  {deletingId === post.id ? (
                                    <Loader2 size={15} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={15} />
                                  )}
                                  삭제
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  )}
                </section>
              );
            })}
          </section>
        </section>

        <section className="hidden">
          {/*
          <form
            onSubmit={submitPost}
            className="self-start rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-[#1d8a6b]">
                  <ReceiptText size={15} />
                  빠른 접수
                </div>
                <h2 className="mt-1 text-xl font-black">간식 사유서</h2>
                <p className="text-sm text-zinc-500">먹었다면, 이유가 있다.</p>
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1d8a6b] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#15775c] disabled:cursor-not-allowed disabled:bg-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                제출
              </button>
            </div>

            {signedIn && notificationSupported ? (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-[#fbfbf8] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid size-10 place-items-center rounded-lg ${
                        notificationPermission === "granted"
                          ? "bg-[#dcfce7] text-[#166534]"
                          : "bg-[#fff1cf] text-[#8a5b00]"
                      }`}
                    >
                      {notificationPermission === "granted" ? (
                        <BellRing size={18} />
                      ) : (
                        <Bell size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black">
                        {notificationLabels[notificationPermission]}
                      </p>
                      {notificationPermission === "denied" ? (
                        <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                          브라우저 설정에서 알림 권한을 다시 허용해야 합니다.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {notificationPermission === "default" ? (
                      <button
                        type="button"
                        onClick={enableNotifications}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#1d8a6b] bg-white px-3 text-sm font-bold text-[#10674f] transition hover:bg-[#effbf6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                      >
                        <Bell size={16} />
                        알림 켜기
                      </button>
                    ) : null}
                    {notificationPermission === "granted" ? (
                      <button
                        type="button"
                        onClick={sendTestNotification}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                      >
                        테스트 알림
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {signedIn ? (
              <div className="mb-3 rounded-lg border border-[#e3eadf] bg-[#fbfcf8] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black">오늘 식단 맥락</p>
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                      공개된 최근 식단을 불러와 이 사건에 첨부합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadRecentMeal}
                    disabled={loadingMeal}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#1d8a6b] bg-white px-3 text-sm font-bold text-[#10674f] transition hover:bg-[#effbf6] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                  >
                    {loadingMeal ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CalendarDays size={16} />
                    )}
                    식단 불러오기
                  </button>
                </div>

                {selectedMeal ? (
                  <div className="mt-3">
                    <MealSummaryCard
                      meal={selectedMeal}
                      removable
                      onRemove={() => {
                        setSelectedMeal(null);
                        setMealMessage("첨부된 식단을 제거했습니다.");
                      }}
                    />
                  </div>
                ) : null}

                {mealMessage ? (
                  <p className="mt-3 text-xs font-semibold text-zinc-500">{mealMessage}</p>
                ) : null}
              </div>
            ) : null}

            <fieldset disabled={!signedIn || submitting} className="space-y-3 disabled:opacity-60">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">간식 이름</span>
                <input
                  value={form.snackName}
                  onChange={(event) => updateField("snackName", event.target.value)}
                  placeholder="컵라면, 삼각김밥, 초코우유"
                  className="min-h-12 w-full rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[#1d8a6b] focus:bg-white focus:ring-2 focus:ring-[#1d8a6b]/15"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">먹은 이유 / 변명</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => updateField("reason", event.target.value)}
                  placeholder="DP 배열을 보다가 정신을 차려보니..."
                  rows={5}
                  className="min-h-28 w-full resize-none rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 py-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[#1d8a6b] focus:bg-white focus:ring-2 focus:ring-[#1d8a6b]/15"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 text-sm font-bold transition has-[:checked]:border-[#1d8a6b] has-[:checked]:bg-[#effbf6]">
                  <input
                    type="checkbox"
                    checked={form.ateLunch}
                    onChange={(event) => updateField("ateLunch", event.target.checked)}
                    className="size-5 accent-[#1d8a6b]"
                  />
                  점심 먹음
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 text-sm font-bold transition has-[:checked]:border-[#1d8a6b] has-[:checked]:bg-[#effbf6]">
                  <input
                    type="checkbox"
                    checked={form.ateDinner}
                    onChange={(event) => updateField("ateDinner", event.target.checked)}
                    className="size-5 accent-[#1d8a6b]"
                  />
                  저녁 먹음
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">태그</span>
                <input
                  value={form.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  placeholder="알고리즘 야식 디버깅"
                  className="min-h-12 w-full rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[#1d8a6b] focus:bg-white focus:ring-2 focus:ring-[#1d8a6b]/15"
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">이미지</span>
                  <span className="text-xs font-semibold text-zinc-500">
                    {draftImages.length}/{maxImages}
                  </span>
                </div>
                <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#58b99f] bg-[#effbf6] px-3 py-3 text-center text-sm font-bold text-[#10674f] transition hover:bg-[#e5f7ef]">
                  <ImagePlus size={22} />
                  <span>jpg, png, webp</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={remainingImages <= 0}
                  />
                </label>

                {draftImages.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {draftImages.map((image) => (
                      <div
                        key={image.id}
                        className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm"
                      >
                        <img
                          src={image.previewUrl}
                          alt="첨부 이미지 미리보기"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeDraftImage(image.id)}
                          className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-zinc-950/75 text-white transition hover:bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                          aria-label="이미지 삭제"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </fieldset>

            {!signedIn ? (
              <div className="mt-4 rounded-lg border border-[#f3d27d] bg-[#fff7d9] px-3 py-2 text-sm font-semibold text-[#7a5200]">
                소셜 로그인 후 사유서를 제출할 수 있습니다.
              </div>
            ) : null}

            {message ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">
                {message}
              </div>
            ) : null}
          </form>
          */}

          <aside className="hidden">
            <div className="flex items-center gap-2 text-xs font-black text-[var(--jungle-green)]">
              <ReceiptText size={15} />
              새 사건 접수
            </div>
            <h2 className="mt-2 text-xl font-black text-[var(--jungle-deep)]">
              간식 사유서는 별도 페이지에서 작성합니다.
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              이미지 첨부, 식단 불러오기, 브라우저 알림까지 한 화면에서 차분하게 접수할 수
              있습니다.
            </p>
            <Link
              href="/posts/new"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--jungle-deep)] px-4 text-sm font-black text-white transition hover:bg-[#025334] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jungle-mint)]"
            >
              <Send size={16} />
              포스트 작성하기
            </Link>
            {!signedIn ? (
              <p className="mt-3 rounded-lg bg-[#fff7d7] px-3 py-2 text-xs font-bold leading-5 text-[#7a5200]">
                로그인하지 않은 경우 작성 페이지에서 소셜 로그인을 먼저 진행합니다.
              </p>
            ) : null}
            {message ? (
              <p className="mt-3 rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 py-2 text-xs font-bold leading-5 text-zinc-600">
                {message}
              </p>
            ) : null}
          </aside>

          <section className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-black text-[#ad315c]">
                  <Scale size={15} />
                  공개 재판 피드
                </p>
                <h2 className="mt-1 text-xl font-black">최신 사건</h2>
              </div>
              <span className="rounded-full bg-[#ffe6ef] px-3 py-1 text-xs font-black text-[#ad315c] ring-1 ring-[#f3b4c7]">
                {posts.length}건
              </span>
            </div>

            <div className="space-y-4">
              {loadingPosts ? (
                <div className="grid min-h-48 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm">
                  <Loader2 size={22} className="animate-spin" />
                </div>
              ) : null}

              {!loadingPosts && posts.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
                  <p className="text-base font-black">아직 접수된 간식이 없습니다.</p>
                  <p className="mt-1 text-sm text-zinc-500">첫 사건을 열어주세요.</p>
                </div>
              ) : null}

              {posts.map((post) => {
                const mine = session?.user?.id === post.author.id;
                const commentsOpen = Boolean(openComments[post.id]);
                const comments = commentsByPost[post.id] ?? [];
                const commentDraft = commentDrafts[post.id] ?? "";
                const aiExpanded = Boolean(expandedJudgements[post.id]);
                const aiMessage = aiMessagesByPost[post.id];
                const voteTotal = totalVoteCount(post.voteCounts);

                return (
                  <article
                    key={post.id}
                    className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-[var(--jungle-mint)]"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-[#f8f9fa] px-4 py-2">
                      <div className="flex min-w-0 items-center gap-3 text-xs font-black text-zinc-600">
                        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 ring-1 ring-zinc-200">
                          <ArrowUp size={14} className="text-[var(--jungle-green)]" />
                          {voteTotal}표
                        </span>
                        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-2.5 ring-1 ring-zinc-200">
                          <MessageCircle size={14} className="text-[var(--jungle-purple)]" />
                          댓글 {post.commentCount}
                        </span>
                      </div>
                      <Link
                        href={`/posts/${post.id}`}
                        className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-full bg-[var(--jungle-deep)] px-3 text-xs font-black text-white transition hover:bg-[#025334] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jungle-mint)]"
                      >
                        토론방 입장
                      </Link>
                    </div>
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-[var(--surface-muted)] p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar author={post.author} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[var(--text-strong)]">{authorName(post.author)}</p>
                          <p className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)]">
                            <Clock3 size={12} />
                            {formatCreatedAt(post.createdAt)}
                          </p>
                        </div>
                      </div>

                      {mine ? (
                        <button
                          type="button"
                          onClick={() => deletePost(post.id)}
                          disabled={deletingId === post.id}
                          className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#ef6486] hover:text-[#d93663] disabled:cursor-wait disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef6486]"
                          aria-label="포스트 삭제"
                          title="포스트 삭제"
                        >
                          {deletingId === post.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      ) : null}
                    </div>

                    <div className="p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-black text-zinc-600">
                          사건 #{post.id.slice(-4)}
                        </span>
                        {post.aiJudgement ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${aiVerdictStyles[post.aiJudgement.verdict]}`}
                          >
                            {aiVerdictLabels[post.aiJudgement.verdict]}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 break-words text-2xl font-black leading-tight">
                        {post.snackName}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                        {post.reason}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                      <span
                        className={`rounded-full px-3 py-1 ${
                          post.ateLunch
                            ? "bg-[#dcfce7] text-[#166534]"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {mealStateLabel("점심", post.ateLunch)}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 ${
                          post.ateDinner
                            ? "bg-[#dbeafe] text-[#1d4ed8]"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {mealStateLabel("저녁", post.ateDinner)}
                      </span>
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="max-w-full rounded-full bg-[#fff1cf] px-3 py-1 text-[#8a5b00]"
                        >
                          <span className="block truncate">#{tag}</span>
                        </span>
                      ))}
                    </div>

                    <ImageSlider images={post.images} snackName={post.snackName} />
                    <PostMealContextView post={post} />

                    <VotePanel
                      post={post}
                      signedIn={signedIn}
                      voting={votingPostId === post.id}
                      onVote={submitVote}
                    />

                    <AiJudgementPanel
                      post={post}
                      judgement={post.aiJudgement}
                      signedIn={signedIn}
                      mine={mine}
                      busy={judgingPostId === post.id}
                      expanded={aiExpanded}
                      message={aiMessage}
                      onRequest={requestAiJudgement}
                      onToggleExpanded={() =>
                        setExpandedJudgements((current) => ({
                          ...current,
                          [post.id]: !aiExpanded,
                        }))
                      }
                    />

                    <section className="mt-5 border-t border-dashed border-zinc-200 pt-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-black text-zinc-800">
                          <MessageCircle size={17} />
                          주요 증언
                        </div>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-500">
                          전체 {post.commentCount}개
                        </span>
                      </div>

                      {post.highlightComments.length ? (
                        <div>
                          {post.highlightComments.map((comment) => (
                            <CommentItem
                              key={comment.id}
                              comment={comment}
                              currentUserId={session?.user?.id}
                              likeBusy={likingCommentId === comment.id}
                              deleteBusy={deletingCommentId === comment.id}
                              onToggleLike={(target) => toggleCommentLike(post.id, target)}
                              onDelete={(target) => deleteComment(post.id, target)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-zinc-200 bg-[#fbfbf8] px-3 py-4 text-center text-sm font-semibold text-zinc-500">
                          아직 댓글이 없습니다.
                        </div>
                      )}
                    </section>

                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-[#fbfbf8] text-sm font-black text-zinc-700 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                    >
                      <MessageCircle size={16} />
                      {commentsOpen ? "전체 댓글 접기" : `전체 댓글 열기 (${post.commentCount})`}
                    </button>

                    {commentsOpen ? (
                      <section className="mt-4 border-t border-zinc-100 pt-4">
                        {loadingCommentsId === post.id ? (
                          <div className="grid min-h-24 place-items-center text-zinc-500">
                            <Loader2 size={18} className="animate-spin" />
                          </div>
                        ) : (
                          <>
                            <form
                              onSubmit={(event) => submitComment(post.id, event)}
                              className="mb-4 flex gap-2"
                            >
                              <input
                                value={commentDraft}
                                onChange={(event) =>
                                  setCommentDrafts((current) => ({
                                    ...current,
                                    [post.id]: event.target.value,
                                  }))
                                }
                                disabled={!signedIn || submittingCommentId === post.id}
                                placeholder={
                                  signedIn
                                    ? "댓글로 판결 사유를 남겨주세요"
                                    : "로그인 후 댓글을 쓸 수 있습니다"
                                }
                                className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#1d8a6b] focus:bg-white focus:ring-2 focus:ring-[#1d8a6b]/15 disabled:opacity-60"
                              />
                              <button
                                type="submit"
                                disabled={
                                  !signedIn ||
                                  submittingCommentId === post.id ||
                                  commentDraft.trim().length === 0
                                }
                                className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#1d8a6b] text-white transition hover:bg-[#15775c] disabled:cursor-not-allowed disabled:bg-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8a6b]"
                                aria-label="댓글 작성"
                              >
                                {submittingCommentId === post.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Send size={16} />
                                )}
                              </button>
                            </form>

                            {comments.length ? (
                              <div>
                                {comments.map((comment) => (
                                  <CommentItem
                                    key={comment.id}
                                    comment={comment}
                                    currentUserId={session?.user?.id}
                                    likeBusy={likingCommentId === comment.id}
                                    deleteBusy={deletingCommentId === comment.id}
                                    onToggleLike={(target) => toggleCommentLike(post.id, target)}
                                    onDelete={(target) => deleteComment(post.id, target)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-zinc-200 bg-[#fbfbf8] px-3 py-4 text-center text-sm font-semibold text-zinc-500">
                                전체 댓글창도 아직 조용합니다.
                              </div>
                            )}
                          </>
                        )}
                      </section>
                    ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
