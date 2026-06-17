"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { FoodPreferenceData } from "../food-profile/profile";
import type { MealTypeValue, MenuDay, MenuDayRow } from "../menus/menu-day";
import type { AgentRecommendation } from "./recommendation";
import {
  buildRecommendRequestBody,
  formatMealType,
  formatSpicyTolerance,
  getEvidenceHref,
  recommendationLevelClass,
  recommendationLevelLabel
} from "./recommendation-view";

type AgentRunView = {
  id: string;
  status: string;
  recommendationLevel: AgentRecommendation["recommendationLevel"] | null;
  finalMessage: string | null;
  createdAt: string;
};

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

type AgentRecommendResponse = {
  agentRun: AgentRunView;
  recommendation: AgentRecommendation;
  menuDay: MenuDay;
  selectedMeal: MenuDayRow | null;
  preference: FoodPreferenceData;
  ragResults: RagSearchResult[];
};

const DEFAULT_QUESTION = "오늘 메뉴 나한테 괜찮아?";

type AgentRunHistory = {
  id: string;
  question: string;
  recommendationLevel: AgentRecommendation["recommendationLevel"] | null;
  finalMessage: string | null;
  status: string;
  createdAt: string;
};

export function AgentRecommendClient() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [date, setDate] = useState("");
  const [mealType, setMealType] = useState<MealTypeValue | "">("");
  const [result, setResult] = useState<AgentRecommendResponse | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<AgentRunHistory[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/recommend");
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { runs?: AgentRunHistory[] };
      setHistory(body.runs ?? []);
    } catch {
      // 히스토리는 선택 기능 — 실패 시 무시
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNeedsLogin(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildRecommendRequestBody({ question, date, mealType }))
      });
      const body = (await response.json().catch(() => null)) as
        | (Partial<AgentRecommendResponse> & { error?: string })
        | null;

      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }

      if (!response.ok || !body?.recommendation) {
        setError(body?.error ?? "추천 결과를 만들지 못했습니다.");
        return;
      }

      setResult(body as AgentRecommendResponse);
      loadHistory();
    } catch {
      setError("추천 요청을 보내지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="recommend-layout">
      <section className="panel recommend-input-panel">
        <form className="recommend-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>질문</span>
            <textarea
              name="question"
              onChange={(event) => setQuestion(event.target.value)}
              required
              rows={4}
              value={question}
            />
          </label>

          <div className="recommend-form-grid">
            <label className="field">
              <span>날짜</span>
              <input name="date" onChange={(event) => setDate(event.target.value)} type="date" value={date} />
            </label>
            <label className="field">
              <span>끼니</span>
              <select
                name="mealType"
                onChange={(event) => setMealType(event.target.value as MealTypeValue | "")}
                value={mealType}
              >
                <option value="">자동 선택</option>
                <option value="LUNCH">점심</option>
                <option value="DINNER">저녁</option>
              </select>
            </label>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          {needsLogin ? (
            <p className="form-error">
              로그인 후 사용할 수 있습니다. <Link href="/login">로그인</Link>
            </p>
          ) : null}

          <div className="button-row">
            <button className="button primary" disabled={isLoading} type="submit">
              {isLoading ? "판단 중" : "판단하기"}
            </button>
            <Link className="button" href="/profile/food">
              프로필 수정
            </Link>
          </div>
        </form>

        {history.length > 0 ? (
          <div className="recommend-history">
            <h3>내 진단 히스토리</h3>
            <ul className="recommend-history-list">
              {history.map((run) => (
                <li className="recommend-history-item" key={run.id}>
                  {run.recommendationLevel ? (
                    <span className={`chip ${recommendationLevelClass(run.recommendationLevel)}`}>
                      {recommendationLevelLabel(run.recommendationLevel)}
                    </span>
                  ) : null}
                  <span className="recommend-history-q">{run.question}</span>
                  <span className="recommend-history-date">
                    {new Date(run.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {result ? <RecommendationResult result={result} /> : <RecommendationEmptyState />}
    </div>
  );
}

function RecommendationEmptyState() {
  return (
    <section className="panel recommend-empty-panel">
      <h2>아직 판단한 메뉴가 없습니다</h2>
      <p>질문을 입력하면 오늘 식단과 내 음식 프로필을 기준으로 결과가 표시됩니다.</p>
    </section>
  );
}

function AgentTimeline({ result }: { result: AgentRecommendResponse }) {
  const preferenceCount =
    result.preference.allergyFoods.length +
    result.preference.favoriteFoods.length +
    result.preference.dislikedFoods.length;

  const steps = [
    {
      label: "질문 접수",
      detail: "질문과 옵션 확인"
    },
    {
      label: "식단 조회",
      detail: `${result.menuDay.date} · ${formatMealType(result.recommendation.selectedMealType)}`
    },
    {
      label: "음식 프로필 대조",
      detail: preferenceCount > 0 ? `프로필 ${preferenceCount}개 항목 대조` : "프로필 정보 없음"
    },
    {
      label: "근거 검색",
      detail: `후기·댓글 근거 ${result.ragResults.length}개`
    },
    {
      label: "판단 완료",
      detail: recommendationLevelLabel(result.recommendation.recommendationLevel)
    }
  ];

  return (
    <div className="recommend-block">
      <div className="recommend-block-title">
        <h3>에이전트 실행 단계</h3>
        <span className="chip">{result.agentRun.status}</span>
      </div>
      <ol className="agent-timeline">
        {steps.map((step, index) => (
          <li className="agent-timeline-step" key={step.label}>
            <span className="agent-timeline-marker">{index + 1}</span>
            <div className="agent-timeline-body">
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RecommendationResult({ result }: { result: AgentRecommendResponse }) {
  const level = result.recommendation.recommendationLevel;
  const evidenceCount = result.ragResults.length;

  return (
    <section aria-live="polite" className="panel recommend-result-panel">
      <div className="recommend-result-header">
        <div>
          <div className="eyebrow">추천 결과</div>
          <h2>{formatMealType(result.recommendation.selectedMealType)}</h2>
        </div>
        <span className={`chip ${recommendationLevelClass(level)}`}>{recommendationLevelLabel(level)}</span>
      </div>

      <p className="recommend-final-message">{result.recommendation.finalMessage}</p>

      <AgentTimeline result={result} />

      <div className="recommend-block">
        <h3>선택 메뉴</h3>
        <div className="status-row">
          <span className="chip">{result.menuDay.date}</span>
          <span className="chip">{formatMealType(result.recommendation.selectedMealType)}</span>
        </div>
        {result.recommendation.menuItems.length > 0 ? (
          <div className="tag-row">
            {result.recommendation.menuItems.map((item) => (
              <span className="tag" key={item}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="helper-text left">등록된 메뉴가 없습니다.</p>
        )}
      </div>

      <div className="recommend-block">
        <h3>주의 사유</h3>
        <ul className="reason-list">
          {result.recommendation.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="recommend-block">
        <h3>내 음식 프로필</h3>
        <div className="preference-grid">
          <ProfileSummary title="알레르기" values={result.preference.allergyFoods} />
          <ProfileSummary title="좋아함" values={result.preference.favoriteFoods} />
          <ProfileSummary title="싫어함" values={result.preference.dislikedFoods} />
          <div className="preference-row">
            <span>매운맛</span>
            <strong>{formatSpicyTolerance(result.preference.spicyTolerance)}</strong>
          </div>
        </div>
      </div>

      <div className="recommend-block">
        <div className="recommend-block-title">
          <h3>근거</h3>
          <span className="chip">{evidenceCount}개</span>
        </div>
        {evidenceCount > 0 ? (
          <div className="recommend-evidence-list">
            {result.ragResults.map((evidence) => (
              <EvidenceItem evidence={evidence} key={evidence.id} />
            ))}
          </div>
        ) : (
          <p className="helper-text left">연결된 후기나 댓글 근거가 없습니다.</p>
        )}
      </div>

      <div className="review-meta">
        <span>{result.agentRun.status}</span>
        <span>{new Date(result.agentRun.createdAt).toLocaleString("ko-KR")}</span>
        <span>{result.agentRun.id}</span>
      </div>
    </section>
  );
}

function ProfileSummary({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="preference-row">
      <span>{title}</span>
      <strong>{values.length > 0 ? values.join(", ") : "없음"}</strong>
    </div>
  );
}

function EvidenceItem({ evidence }: { evidence: RagSearchResult }) {
  const href = getEvidenceHref(evidence);
  const title = evidence.review?.title ?? evidence.comment?.review.title ?? "근거";

  return (
    <article className="recommend-evidence">
      <div className="review-meta">
        <span>{evidence.review ? "후기" : "댓글"}</span>
        <span>{new Date(evidence.createdAt).toLocaleDateString("ko-KR")}</span>
        <span>{evidence.review?.author.name ?? evidence.comment?.author.name}</span>
      </div>
      <h4>{href ? <Link href={href}>{title}</Link> : title}</h4>
      <p>{evidence.content}</p>
    </article>
  );
}
