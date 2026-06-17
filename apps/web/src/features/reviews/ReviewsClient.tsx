"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildReviewListSearchParams,
  clampReviewPage,
  type ReviewListQuery
} from "./review";
import { StarRating } from "./StarRating";

type SortKey = "recent" | "rating-high" | "rating-low";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "최신순" },
  { value: "rating-high", label: "별점 높은순" },
  { value: "rating-low", label: "별점 낮은순" }
];

type ReviewListItem = {
  id: string;
  title: string;
  content: string;
  rating: number | null;
  menuNames: string[];
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

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ReviewFilterDraft = {
  query: string;
  tag: string;
  menu: string;
};

const DEFAULT_REVIEW_FILTERS: ReviewListQuery = {
  page: 1,
  pageSize: 10,
  query: "",
  tag: "",
  menu: ""
};

export function ReviewsClient() {
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [draft, setDraft] = useState<ReviewFilterDraft>({
    query: "",
    tag: "",
    menu: ""
  });
  const [filters, setFilters] = useState<ReviewListQuery>(DEFAULT_REVIEW_FILTERS);
  const [sort, setSort] = useState<SortKey>("recent");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // 현재 페이지 결과를 클라이언트에서 정렬 (서버 페이지네이션 유지)
  const sortedReviews = useMemo(() => {
    const copy = [...reviews];
    if (sort === "recent") {
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return copy.sort((a, b) => {
      const left = a.rating ?? -1;
      const right = b.rating ?? -1;
      return sort === "rating-high" ? right - left : left - right;
    });
  }, [reviews, sort]);

  useEffect(() => {
    let isMounted = true;

    async function loadReviews() {
      setIsLoading(true);
      const searchParams = buildReviewListSearchParams(filters);
      const response = await fetch(`/api/reviews?${searchParams.toString()}`);

      if (!isMounted) {
        return;
      }

      if (!response.ok) {
        setError("후기를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const body = (await response.json()) as {
        reviews: ReviewListItem[];
        pagination: Pagination;
      };
      setReviews(body.reviews);
      setPagination(body.pagination);
      setError("");
      setIsLoading(false);
    }

    loadReviews();

    return () => {
      isMounted = false;
    };
  }, [filters]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({
      ...current,
      page: 1,
      query: draft.query.trim(),
      tag: draft.tag.trim(),
      menu: draft.menu.trim()
    }));
  }

  function clearFilters() {
    setDraft({
      query: "",
      tag: "",
      menu: ""
    });
    setFilters(DEFAULT_REVIEW_FILTERS);
  }

  function applyQuickFilter(kind: "tag" | "menu", value: string) {
    setDraft((current) => ({
      ...current,
      [kind]: value
    }));
    setFilters((current) => ({
      ...current,
      [kind]: value,
      page: 1
    }));
  }

  function goToPage(page: number) {
    setFilters((current) => ({
      ...current,
      page: clampReviewPage(page, pagination?.totalPages ?? 1)
    }));
  }

  return (
    <section className="review-board">
      <div className="toolbar">
        <form className="search-form filters" onSubmit={handleSearch}>
          <input
            aria-label="후기 검색"
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
            placeholder="키워드"
            type="search"
            value={draft.query}
          />
          <input
            aria-label="메뉴명 필터"
            onChange={(event) => setDraft((current) => ({ ...current, menu: event.target.value }))}
            placeholder="메뉴명"
            type="search"
            value={draft.menu}
          />
          <input
            aria-label="태그 필터"
            onChange={(event) => setDraft((current) => ({ ...current, tag: event.target.value }))}
            placeholder="태그"
            type="search"
            value={draft.tag}
          />
          <button className="button" type="submit">
            검색
          </button>
          <button className="button" onClick={clearFilters} type="button">
            초기화
          </button>
        </form>
        <label className="sort-field">
          <span>정렬</span>
          <select onChange={(event) => setSort(event.target.value as SortKey)} value={sort}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Link className="button primary" href="/reviews/new">
          후기 작성
        </Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? <p className="helper-text">불러오는 중</p> : null}

      {!isLoading && reviews.length === 0 ? (
        <article className="panel">
          <h2>아직 후기가 없습니다.</h2>
          <p>첫 번째 식단 후기를 남겨보세요.</p>
        </article>
      ) : null}

      <div className="review-list">
        {sortedReviews.map((review) => (
          <article className="panel review-card" key={review.id}>
            <div className="review-meta">
              <span>{review.author.name}</span>
              <span>{new Date(review.createdAt).toLocaleDateString("ko-KR")}</span>
              <StarRating size="sm" value={review.rating} />
            </div>
            <h2>
              <Link href={`/reviews/${review.id}`}>{review.title}</Link>
            </h2>
            <p>{review.content}</p>
            <div className="tag-row">
              {review.menuNames.map((name) => (
                <button className="tag tag-button" key={`menu-${name}`} onClick={() => applyQuickFilter("menu", name)} type="button">
                  {name}
                </button>
              ))}
              {review.tags.map(({ tag }) => (
                <button className="tag tag-button muted" key={tag.name} onClick={() => applyQuickFilter("tag", tag.name)} type="button">
                  #{tag.name}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      {pagination ? (
        <div className="pagination">
          <button
            className="button"
            disabled={pagination.page <= 1}
            onClick={() => goToPage(pagination.page - 1)}
            type="button"
          >
            이전
          </button>
          <span>
            전체 {pagination.total}개 / {pagination.page}쪽 / {pagination.totalPages}쪽
          </span>
          <button
            className="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => goToPage(pagination.page + 1)}
            type="button"
          >
            다음
          </button>
        </div>
      ) : null}
    </section>
  );
}
