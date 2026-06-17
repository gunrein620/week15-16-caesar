"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

type RagSearchResult = {
  id: string;
  content: string;
  metadata: unknown;
  createdAt: string;
  review: {
    id: string;
    title: string;
    rating: number | null;
    menuNames: string[];
    author: {
      name: string;
    };
  } | null;
  comment: {
    id: string;
    reviewId: string;
    author: {
      name: string;
    };
    review: {
      id: string;
      title: string;
    };
  } | null;
};

export function RagSearchClient() {
  const [query, setQuery] = useState("제육볶음");
  const [results, setResults] = useState<RagSearchResult[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    setHasSearched(true);

    const searchParams = new URLSearchParams({
      query,
      limit: "5"
    });
    const response = await fetch(`/api/rag/search?${searchParams.toString()}`);

    setIsLoading(false);

    if (!response.ok) {
      setError("RAG 검색을 실행하지 못했습니다.");
      return;
    }

    const body = (await response.json()) as { results: RagSearchResult[] };
    setResults(body.results);
  }

  return (
    <section className="panel rag-panel">
      <div>
        <h2>RAG 근거 검색</h2>
        <p>저장된 후기와 댓글에서 오늘 판단에 참고할 만한 근거를 찾습니다.</p>
      </div>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          aria-label="RAG 검색 질문"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 제육볶음 어땠어?"
          type="search"
          value={query}
        />
        <button className="button primary" type="submit">
          검색
        </button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? <p className="helper-text">검색 중</p> : null}
      {hasSearched && !isLoading && results.length === 0 ? <p className="helper-text">관련 근거가 없습니다.</p> : null}

      <div className="rag-result-list">
        {results.map((result) => (
          <article className="rag-result" key={result.id}>
            <div className="review-meta">
              <span>{result.review ? "후기" : "댓글"}</span>
              <span>{new Date(result.createdAt).toLocaleDateString("ko-KR")}</span>
              <span>{result.review?.author.name ?? result.comment?.author.name}</span>
            </div>
            {result.review ? (
              <h3>
                <Link href={`/reviews/${result.review.id}`}>{result.review.title}</Link>
              </h3>
            ) : null}
            {result.comment ? (
              <h3>
                <Link href={`/reviews/${result.comment.review.id}`}>{result.comment.review.title}</Link>
              </h3>
            ) : null}
            <p>{result.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
