"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StarRating } from "./StarRating";

type RagResult = {
  id: string;
  content: string;
  review: {
    id: string;
    title: string;
    rating: number | null;
    menuNames: string[];
    author: { name: string };
  } | null;
  comment: {
    review: { id: string; title: string };
  } | null;
};

type RagSearchResponse = {
  searchMode: "semantic" | "keyword" | "text";
  results: RagResult[];
};

type SimilarItem = {
  reviewId: string;
  title: string;
  rating: number | null;
  menuNames: string[];
  authorName: string | null;
  snippet: string;
};

/**
 * RAG 검색(/api/rag/search)으로 현재 후기와 비슷한 후기를 찾아 보여줍니다.
 * - 검색어는 제목 + 메뉴명을 사용하고, 현재 후기는 결과에서 제외합니다.
 */
export function SimilarReviews({
  reviewId,
  query
}: {
  reviewId: string;
  query: string;
}) {
  const [items, setItems] = useState<SimilarItem[]>([]);
  const [mode, setMode] = useState<RagSearchResponse["searchMode"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();

    if (!trimmed) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    async function loadSimilar() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ query: trimmed, limit: "6" });
        const response = await fetch(`/api/rag/search?${params.toString()}`);
        if (!response.ok) {
          if (active) {
            setItems([]);
          }
          return;
        }

        const body = (await response.json()) as RagSearchResponse;
        const seen = new Set<string>([reviewId]);
        const collected: SimilarItem[] = [];

        for (const result of body.results) {
          const target = result.review ?? result.comment?.review ?? null;
          if (!target || seen.has(target.id)) {
            continue;
          }
          seen.add(target.id);
          collected.push({
            reviewId: target.id,
            title: target.title,
            rating: result.review?.rating ?? null,
            menuNames: result.review?.menuNames ?? [],
            authorName: result.review?.author.name ?? null,
            snippet: result.content
          });
          if (collected.length >= 4) {
            break;
          }
        }

        if (active) {
          setItems(collected);
          setMode(body.searchMode);
        }
      } catch {
        if (active) {
          setItems([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadSimilar();
    return () => {
      active = false;
    };
  }, [reviewId, query]);

  if (isLoading) {
    return (
      <section className="panel similar-reviews">
        <h3>비슷한 후기</h3>
        <p className="helper-text left">불러오는 중...</p>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="panel similar-reviews">
      <div className="recommend-block-title">
        <h3>비슷한 후기</h3>
        {mode ? <span className="chip">{mode === "semantic" ? "의미 검색" : "키워드 검색"}</span> : null}
      </div>
      <div className="similar-list">
        {items.map((item) => (
          <article className="similar-card" key={item.reviewId}>
            <div className="review-meta">
              {item.authorName ? <span>{item.authorName}</span> : null}
              <StarRating size="sm" value={item.rating} />
            </div>
            <h4>
              <Link href={`/reviews/${item.reviewId}`}>{item.title}</Link>
            </h4>
            <p>{item.snippet}</p>
            {item.menuNames.length > 0 ? (
              <div className="tag-row">
                {item.menuNames.map((name) => (
                  <span className="tag" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
