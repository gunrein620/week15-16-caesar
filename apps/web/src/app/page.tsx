import Link from "next/link";
import { prisma } from "@junglebob/db";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import {
  buildAgentRecommendation,
  type AgentRecommendation,
  type RecommendationLevelValue
} from "@/features/agent/recommendation";
import { defaultFoodPreference, type FoodPreferenceData } from "@/features/food-profile/profile";
import { buildTopRatedMenus, type TopRatedMenu } from "@/features/reviews/top-rated";
import {
  buildMenuDay,
  parseMenuDate,
  todayKstDateText,
  type MealTypeValue,
  type MenuDay,
  type MenuDayRow
} from "@/features/menus/menu-day";
import { normalizeExistingMenuImageUrl } from "@/features/menus/menu-image";
import { normalizeMealPhotoUrl } from "@/features/menus/menu-image-url";
import {
  currentFeaturedMealType,
  extractMainMenu,
  formatMenuDateShort,
  selectMenuImageState,
  type MenuImageState
} from "@/features/menus/menu-image-fallback";

type MealMeta = {
  label: string;
  icon: string;
};

const MEAL_META: Record<MealTypeValue, MealMeta> = {
  LUNCH: { label: "점심", icon: "🍴" },
  DINNER: { label: "저녁", icon: "🌙" }
};

const LEVEL_META: Record<RecommendationLevelValue, { label: string; variant: string; icon: string }> = {
  GOOD: { label: "GOOD · 괜찮아요", variant: "good", icon: "✅" },
  CAUTION: { label: "CAUTION · 주의", variant: "warn", icon: "⚠️" },
  AVOID: { label: "AVOID · 피하세요", variant: "danger", icon: "🚫" }
};

function formatDateLabel(date: string): string {
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short"
  }).format(parseMenuDate(date));
  const dotted = date.replace(/-/g, ".");

  return `${dotted} (${weekday})`;
}

async function loadTodayMenu(date: string): Promise<MenuDay> {
  const rows = await prisma.menuArchive.findMany({
    where: { date: parseMenuDate(date) },
    select: { id: true, mealType: true, items: true, rawText: true, imageUrl: true, imageType: true }
  });

  const normalized = await Promise.all(
    rows.map(async ({ imageType, ...row }) => ({
      ...row,
      imageUrl:
        imageType === "MEAL_PHOTO"
          ? await normalizeExistingMenuImageUrl(normalizeMealPhotoUrl(row.imageUrl, imageType))
          : null
    }))
  );

  return buildMenuDay(date, normalized as MenuDayRow[]);
}

async function resolveFeaturedImage(
  date: string,
  meal: MenuDayRow | null
): Promise<MenuImageState> {
  if (!meal) {
    return { imageUrl: null, source: "none", substituteDate: null };
  }

  const mainMenu = extractMainMenu(meal.items);
  const pastRows = await prisma.menuArchive.findMany({
    where: {
      date: { lt: parseMenuDate(date) },
      imageUrl: { not: null },
      imageType: "MEAL_PHOTO"
    },
    orderBy: { date: "desc" },
    take: 40,
    select: { date: true, items: true, imageUrl: true }
  });

  const candidates = await Promise.all(
    pastRows.map(async (row) => ({
      date: row.date.toISOString().slice(0, 10),
      items: row.items,
      imageUrl: await normalizeExistingMenuImageUrl(row.imageUrl)
    }))
  );

  return selectMenuImageState({ todayImageUrl: meal.imageUrl, mainMenu, candidates });
}

async function loadRecommendation(
  userId: string,
  meal: MenuDayRow | null
): Promise<AgentRecommendation> {
  const stored = await prisma.foodPreference.findUnique({
    where: { userId },
    select: { allergyFoods: true, favoriteFoods: true, dislikedFoods: true, spicyTolerance: true }
  });
  const preference = (stored ?? defaultFoodPreference()) as FoodPreferenceData;

  return buildAgentRecommendation({
    question: "오늘 메뉴 나한테 괜찮아?",
    selectedMeal: meal,
    preference,
    ragResults: []
  });
}

type RecentReview = {
  id: string;
  title: string;
  rating: number | null;
  menuNames: string[];
  tags: { tag: { name: string } }[];
};

async function loadRecentReviews(): Promise<RecentReview[]> {
  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      title: true,
      rating: true,
      menuNames: true,
      tags: { select: { tag: { select: { name: true } } } }
    }
  });
}

async function loadTopRatedMenus(): Promise<TopRatedMenu[]> {
  const rows = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { rating: true, menuNames: true }
  });

  return buildTopRatedMenus(rows, { limit: 5 });
}

type MenuPhoto = {
  date: string;
  mealType: MealTypeValue;
  imageUrl: string;
};

// 최근 식단 중 이미지가 있는 끼니를 모아 갤러리에 쓴다.
async function loadRecentMenuPhotos(): Promise<MenuPhoto[]> {
  const rows = await prisma.menuArchive.findMany({
    where: {
      date: { lte: parseMenuDate(todayKstDateText()) },
      imageUrl: { not: null },
      imageType: "MEAL_PHOTO"
    },
    orderBy: [{ date: "desc" }, { mealType: "asc" }],
    take: 24,
    select: { date: true, mealType: true, imageUrl: true }
  });

  const photos = await Promise.all(
    rows.map(async (row) => ({
      date: row.date.toISOString().slice(0, 10),
      mealType: row.mealType as MealTypeValue,
      imageUrl: await normalizeExistingMenuImageUrl(row.imageUrl)
    }))
  );

  return photos.filter((photo): photo is MenuPhoto => photo.imageUrl !== null).slice(0, 8);
}

type WeekBestReview = {
  id: string;
  title: string;
  content: string;
  rating: number | null;
  menuNames: string[];
  author: { name: string };
  commentCount: number;
  tags: { tag: { name: string } }[];
};

// 최근 7일 후기 중 별점·댓글 수가 가장 높은 후기를 고른다.
async function loadBestReviewOfWeek(): Promise<WeekBestReview | null> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.review.findMany({
    where: { createdAt: { gte: weekAgo }, rating: { not: null } },
    take: 50,
    select: {
      id: true,
      title: true,
      content: true,
      rating: true,
      menuNames: true,
      author: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
      _count: { select: { comments: true } }
    }
  });

  if (rows.length === 0) {
    return null;
  }

  const ranked = rows
    .map((row) => ({ ...row, commentCount: row._count.comments }))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.commentCount - a.commentCount);

  const best = ranked[0];

  if (!best) {
    return null;
  }

  return {
    id: best.id,
    title: best.title,
    content: best.content,
    rating: best.rating,
    menuNames: best.menuNames,
    author: best.author,
    commentCount: best.commentCount,
    tags: best.tags
  };
}

function stars(rating: number | null): string {
  if (rating === null) {
    return "☆☆☆☆☆";
  }

  const filled = Math.max(0, Math.min(5, rating));

  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function ratingLabel(rating: number | null): string {
  return rating === null ? "별점 없음" : `별점 ${rating}점`;
}

function RecentReviews({ reviews }: { reviews: RecentReview[] }) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <section className="home-section" aria-label="최근 후기">
      <div className="home-section-head">
        <h2>최근 후기</h2>
        <Link className="text-link" href="/reviews">
          후기 게시판 →
        </Link>
      </div>
      <div className="review-mini-list">
        {reviews.map((review) => {
          const chips = review.tags.map((entry) => entry.tag.name);
          const fallbackChips = chips.length > 0 ? chips : review.menuNames;

          return (
            <Link key={review.id} className="review-mini" href={`/reviews/${review.id}`}>
              <span className="review-stars" aria-label={ratingLabel(review.rating)}>
                {stars(review.rating)}
              </span>
              <span className="review-mini-title">{review.title}</span>
              {fallbackChips.length > 0 ? (
                <span className="review-mini-tags">
                  {fallbackChips.slice(0, 3).map((name) => (
                    <span key={name} className="mini-chip">
                      {name}
                    </span>
                  ))}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TopRatedMenus({ menus }: { menus: TopRatedMenu[] }) {
  if (menus.length === 0) {
    return null;
  }

  return (
    <section className="home-section" aria-label="평점 높은 메뉴">
      <div className="home-section-head">
        <h2>맛있다고 소문난 메뉴</h2>
        <Link className="text-link" href="/reviews">
          후기로 보기 →
        </Link>
      </div>
      <ol className="top-menu-list">
        {menus.map((menu, index) => (
          <li key={menu.menu} className="top-menu-row">
            <span className="top-menu-rank">{index + 1}</span>
            <span className="top-menu-name">{menu.menu}</span>
            <span className="top-menu-score">
              <span className="top-menu-star">★</span> {menu.averageRating.toFixed(1)}
              <span className="top-menu-count">후기 {menu.reviewCount}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MealImage({ image, mealLabel }: { image: MenuImageState; mealLabel: string }) {
  if (image.source === "none" || !image.imageUrl) {
    return (
      <div className="meal-photo meal-photo-empty" aria-hidden="true">
        <span className="meal-photo-emoji">🍲</span>
      </div>
    );
  }

  return (
    <div className="meal-photo">
      <img src={image.imageUrl} alt={`${mealLabel} 식단 사진`} />
      {image.source === "today" ? (
        <span className="photo-badge photo-badge-live">✓ 오늘 사진</span>
      ) : (
        <span className="photo-badge">
          📷 지난 {image.substituteDate ? formatMenuDateShort(image.substituteDate) : ""} 사진
        </span>
      )}
    </div>
  );
}

function FeaturedMeal({
  meal,
  mealType,
  image
}: {
  meal: MenuDayRow;
  mealType: MealTypeValue;
  image: MenuImageState;
}) {
  const meta = MEAL_META[mealType];
  const mainMenu = extractMainMenu(meal.items);
  const restItems = meal.items.filter((item) => item !== mainMenu);

  return (
    <article className="featured-meal">
      <MealImage image={image} mealLabel={meta.label} />
      <div className="featured-meal-body">
        <span className={`meal-tag meal-tag-${mealType.toLowerCase()}`}>
          {meta.icon} {meta.label}
        </span>
        <h2 className="featured-meal-title">{mainMenu ?? meal.items[0] ?? "등록된 메뉴 없음"}</h2>
        {restItems.length > 0 ? (
          <p className="featured-meal-rest">{restItems.join(" · ")}</p>
        ) : null}
        {image.source === "substitute" ? (
          <p className="featured-meal-note">
            아직 오늘 사진이 안 올라와, 같은 메인 메뉴가 나왔던 날 사진을 보여드려요.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function CompactMeal({ meal, mealType }: { meal: MenuDayRow; mealType: MealTypeValue }) {
  const meta = MEAL_META[mealType];

  return (
    <div className="compact-meal">
      <span className={`meal-tag meal-tag-${mealType.toLowerCase()}`}>
        {meta.icon} {meta.label}
      </span>
      <span className="compact-meal-items">{meal.items.join(" · ")}</span>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: AgentRecommendation }) {
  const level = LEVEL_META[recommendation.recommendationLevel];

  return (
    <section className={`ai-result ai-result-${level.variant}`} aria-label="AI 추천 결과">
      <div className="ai-result-head">
        <span className={`level-chip level-chip-${level.variant}`}>{level.label}</span>
        <span className="ai-result-caption">현재 정보 기준 · 공식 식단표도 확인하세요</span>
      </div>
      <p className="ai-result-message">{recommendation.finalMessage}</p>
      <div className="ai-result-foot">
        <Link className="text-link" href="/ai/recommend">
          AI 추천 자세히 보기 →
        </Link>
      </div>
    </section>
  );
}

function MenuGallery({ photos }: { photos: MenuPhoto[] }) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="home-section" aria-label="최근 식단 사진">
      <div className="home-section-head">
        <h2>최근 식단 사진</h2>
        <Link className="text-link" href="/menus">
          식단 보기 →
        </Link>
      </div>
      <div className="menu-gallery">
        {photos.map((photo) => (
          <Link
            key={`${photo.date}-${photo.mealType}`}
            className="menu-gallery-item"
            href={`/menus?date=${photo.date}`}
          >
            <img src={photo.imageUrl} alt={`${photo.date} ${MEAL_META[photo.mealType].label}`} />
            <span>
              {formatMenuDateShort(photo.date)} {MEAL_META[photo.mealType].label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function BestReviewOfWeek({ review }: { review: WeekBestReview }) {
  const chips = [...review.menuNames.slice(0, 2), ...review.tags.slice(0, 2).map(({ tag }) => `#${tag.name}`)];

  return (
    <section className="home-section" aria-label="이번 주 베스트 후기">
      <div className="home-section-head">
        <h2>🏆 이번 주 베스트 후기</h2>
        <Link className="text-link" href="/reviews">
          후기 더 보기 →
        </Link>
      </div>
      <Link className="best-review" href={`/reviews/${review.id}`}>
        <span className="best-review-crown" aria-hidden="true">
          👑
        </span>
        <div className="best-review-content">
          <div className="review-meta">
            <span className="review-stars" aria-label={ratingLabel(review.rating)}>
              {stars(review.rating)}
            </span>
            <span>{review.author.name} · 이번 주 1위</span>
            <span className="best-review-comments">댓글 {review.commentCount}</span>
          </div>
          <h3 className="best-review-title">{review.title}</h3>
          <p className="best-review-body">{review.content}</p>
          {chips.length > 0 ? (
            <span className="review-mini-tags">
              {chips.map((chip) => (
                <span key={chip} className="mini-chip">
                  {chip}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </Link>
    </section>
  );
}

function InviteBand() {
  return (
    <section className="ai-invite" aria-label="AI 추천 안내">
      <span className="ai-invite-emoji" aria-hidden="true">
        🤖
      </span>
      <div className="ai-invite-copy">
        <h2>이 메뉴, 나한테 괜찮을까?</h2>
        <p>로그인하고 알레르기·취향을 등록하면 AI가 GOOD · CAUTION · AVOID로 알려드려요.</p>
      </div>
      <Link className="button primary" href="/signup">
        시작하기 →
      </Link>
    </section>
  );
}

export default async function HomePage() {
  const today = todayKstDateText();
  const featuredType = currentFeaturedMealType();
  const [user, menuDay] = await Promise.all([getCurrentUserFromCookies(), loadTodayMenu(today)]);

  const featuredMeal = menuDay.meals[featuredType === "LUNCH" ? "lunch" : "dinner"];
  const otherType: MealTypeValue = featuredType === "LUNCH" ? "DINNER" : "LUNCH";
  const otherMeal = menuDay.meals[otherType === "LUNCH" ? "lunch" : "dinner"];

  const [featuredImage, recommendation, recentReviews, topMenus, menuPhotos, bestReview] = await Promise.all([
    resolveFeaturedImage(today, featuredMeal),
    user ? loadRecommendation(user.id, featuredMeal) : Promise.resolve(null),
    loadRecentReviews(),
    loadTopRatedMenus(),
    loadRecentMenuPhotos(),
    loadBestReviewOfWeek()
  ]);

  const heroTitle = user
    ? `${user.name}님, 오늘 ${MEAL_META[featuredType].label}은요`
    : "오늘의 정글밥";

  return (
    <>
      <section className="home-hero">
        <div className="eyebrow">
          오늘 {formatDateLabel(today)} · 지금은 {MEAL_META[featuredType].label} 시간
        </div>
        <h1>{heroTitle}</h1>

        {featuredMeal ? (
          <FeaturedMeal meal={featuredMeal} mealType={featuredType} image={featuredImage} />
        ) : (
          <article className="featured-meal featured-meal-empty">
            <p>오늘 {MEAL_META[featuredType].label} 메뉴가 아직 등록되지 않았어요.</p>
            <Link className="text-link" href="/menus">
              다른 날짜 식단 보기 →
            </Link>
          </article>
        )}

        {otherMeal ? <CompactMeal meal={otherMeal} mealType={otherType} /> : null}
      </section>

      {user && recommendation ? (
        <RecommendationCard recommendation={recommendation} />
      ) : (
        <InviteBand />
      )}

      <section className="home-cards" aria-label="정글밥 주요 기능">
        <Link className="home-card" href="/menus">
          <span className="home-card-emoji" aria-hidden="true">
            🍽️
          </span>
          <span className="home-card-title">식단 보기</span>
          <span className="home-card-sub">날짜별 점심·저녁</span>
        </Link>
        <Link className="home-card" href="/reviews">
          <span className="home-card-emoji" aria-hidden="true">
            💬
          </span>
          <span className="home-card-title">후기 게시판</span>
          <span className="home-card-sub">메뉴 후기와 댓글</span>
        </Link>
        <Link className="home-card" href={user ? "/profile/food" : "/login"}>
          <span className="home-card-emoji" aria-hidden="true">
            🧑‍🍳
          </span>
          <span className="home-card-title">음식 프로필</span>
          <span className="home-card-sub">알레르기·취향 설정</span>
        </Link>
      </section>

      <MenuGallery photos={menuPhotos} />

      {bestReview ? <BestReviewOfWeek review={bestReview} /> : null}

      <RecentReviews reviews={recentReviews} />
      <TopRatedMenus menus={topMenus} />
    </>
  );
}
