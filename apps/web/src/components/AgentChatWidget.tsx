"use client";

import { useEffect, useRef, useState } from "react";
import { getEvidenceHref } from "@/features/agent/recommendation-view";
import { shiftMenuDate, todayKstDateText } from "@/features/menus/menu-day";

const SPICY_KEYWORDS = [
  "매운", "매콤", "맵", "청양", "불닭", "불막", "칼칼", "얼큰", "고추", "마라", "땡초", "김치찌개", "제육", "떡볶이", "낙지", "쭈꾸미", "닭갈비"
];

// 질문에서 상대 날짜(오늘/내일/모레/어제)를 읽어 조회할 날짜를 정한다.
function resolveMenuDate(text: string): { date: string; label: string } {
  const t = text.replace(/\s+/g, "");
  const today = todayKstDateText();

  if (/모레/.test(t)) {
    return { date: shiftMenuDate(today, 2), label: "모레" };
  }
  if (/내일|낼/.test(t)) {
    return { date: shiftMenuDate(today, 1), label: "내일" };
  }
  if (/그저께|그제/.test(t)) {
    return { date: shiftMenuDate(today, -2), label: "그저께" };
  }
  if (/어제/.test(t)) {
    return { date: shiftMenuDate(today, -1), label: "어제" };
  }

  const weekdayMatch = /([월화수목금토일])요일/.exec(t);
  if (weekdayMatch) {
    const map: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    const target = map[weekdayMatch[1]];
    const todayDow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    return { date: shiftMenuDate(today, target - todayDow), label: `${weekdayMatch[1]}요일` };
  }

  return { date: today, label: "오늘" };
}

type RecommendationLevel = "GOOD" | "CAUTION" | "AVOID";

type RagResult = {
  id: string;
  content: string;
  review: { id: string; title: string } | null;
  comment: { review: { id: string; title: string } } | null;
};

type Evidence = {
  id: string;
  href: string | null;
  title: string;
  snippet: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "bot";
  text: string;
  level?: RecommendationLevel;
  menu?: string[];
  steps?: string[];
  evidence?: Evidence[];
  showDetail?: boolean;
  loginPrompt?: boolean;
};

const MONKEY = "🐵";

const LEVEL_LABEL: Record<RecommendationLevel, { label: string; variant: string }> = {
  GOOD: { label: "GOOD · 괜찮아요", variant: "good" },
  CAUTION: { label: "CAUTION · 주의", variant: "warn" },
  AVOID: { label: "AVOID · 피하세요", variant: "danger" }
};

const LEVEL_REACTION: Record<RecommendationLevel, string> = {
  GOOD: "우끼끼! 좋아 보여~",
  CAUTION: "음… 끼끼, 이건 좀 조심!",
  AVOID: "끼익! 이건 패스하자!"
};

const GREETING: ChatMessage = {
  id: 0,
  role: "bot",
  text: "안녕 끼끼! 나는 정글밥 몽키야 🐵 오늘 점심·저녁이 너한테 괜찮은지 봐줄게. 뭐가 궁금해? (예: 오늘 점심 나한테 괜찮아?)"
};

// 아래 버튼을 누르면 바로 질문이 전송된다.
const QUICK_REPLIES = ["오늘 점심 어때?", "오늘 메뉴 뭐야?", "내 알레르기 뭐였지?", "뭘 할 수 있어?"];

type ChatIntent = "greeting" | "thanks" | "help" | "profile" | "spicy" | "menu" | "recommend" | "chat";

// 입력 문장을 키워드로 분류한다. 메뉴 적합성 질문이 메뉴 목록보다 우선한다.
function classifyIntent(text: string): ChatIntent {
  const t = text.replace(/\s+/g, "");

  if (/(안녕|하이|헬로|반가|hi|hello|안뇽)/i.test(t)) {
    return "greeting";
  }
  if (/(고마|감사|ㄳ|땡큐|thank)/i.test(t)) {
    return "thanks";
  }
  // 매운지 묻는 질문은 메뉴 적합성/목록보다 먼저 처리
  if (/(매워|맵|매운|매콤|안매|얼큰)/.test(t)) {
    return "spicy";
  }
  if (/(괜찮|어때|추천|먹어도|나한테|먹을까|좋을까|피해야|괜찬)/.test(t)) {
    return "recommend";
  }
  if (/(뭘?할수있|뭐할수|도움말|사용법|기능|어떻게써|help)/i.test(t)) {
    return "help";
  }
  if (/(내.*(알레르기|프로필|취향|싫어|좋아|매운))|(알레르기.*(뭐|뭣))/.test(text)) {
    return "profile";
  }
  // 요일(목요일 등)이나 상대날짜가 들어가면 그 날 메뉴를 묻는 것으로 본다.
  const hasDate = /([월화수목금토일])요일|오늘|내일|모레|어제|그저께|그제|낼/.test(t);
  // "머/머야"는 "뭐/뭐야"의 흔한 오타라 함께 인식한다.
  if (hasDate || /(메뉴|식단|뭐나와|뭐먹|머먹|오늘뭐|오늘머|점심뭐|점심머|저녁뭐|저녁머|뭐야|머야|뭐임|머임)/.test(t)) {
    return "menu";
  }
  // 규칙으로 못 잡는 자유로운 질문은 LLM 대화로 넘긴다.
  return "chat";
}

const HELP_TEXT =
  "끼끼! 난 이런 걸 도와줄 수 있어 🐵\n" +
  "• 오늘 메뉴가 너한테 괜찮은지 판단 (예: 오늘 점심 나한테 괜찮아?)\n" +
  "• 오늘 점심·저녁 메뉴 알려주기\n" +
  "• 네가 등록한 알레르기·취향 확인\n" +
  "아래 버튼을 눌러도 돼!";

function buildSteps(ragCount: number): string[] {
  return ["오늘 메뉴 조회", "내 음식 프로필", `유사 후기 ${ragCount}건`, "최종 판단"];
}

function buildEvidence(results: RagResult[] | undefined): Evidence[] {
  if (!results) {
    return [];
  }

  return results.slice(0, 3).map((result) => ({
    id: result.id,
    href: getEvidenceHref({
      review: result.review ? { id: result.review.id } : null,
      comment: result.comment ? { review: { id: result.comment.review.id } } : null
    }),
    title: result.review?.title ?? result.comment?.review.title ?? "관련 후기",
    snippet: result.content.length > 60 ? `${result.content.slice(0, 60)}…` : result.content
  }));
}

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const nextId = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  // 로그아웃 시 챗봇 대화를 처음 상태로 초기화한다.
  useEffect(() => {
    function handleLogout() {
      setMessages([GREETING]);
      setInput("");
      setOpen(false);
      nextId.current = 1;
    }

    window.addEventListener("junglebob:logout", handleLogout);
    return () => window.removeEventListener("junglebob:logout", handleLogout);
  }, []);

  function pushMessage(message: Omit<ChatMessage, "id">) {
    setMessages((prev) => [...prev, { ...message, id: nextId.current++ }]);
  }

  async function runRecommend(question: string) {
    try {
      const response = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      if (response.status === 401) {
        pushMessage({
          role: "bot",
          text: "끼끼, 아직 누군지 모르겠어! 로그인하고 알레르기·취향을 등록하면 딱 맞게 봐줄게 🐵",
          loginPrompt: true
        });
        return;
      }

      const data = (await response.json()) as {
        recommendation?: { recommendationLevel: RecommendationLevel; finalMessage: string };
        selectedMeal?: { items: string[] } | null;
        ragResults?: RagResult[];
        error?: string;
      };

      if (!response.ok || !data.recommendation) {
        pushMessage({
          role: "bot",
          text: data.error ? `우끼… 잠깐 문제가 생겼어: ${data.error}` : "우끼… 잠깐 문제가 생겼어. 다시 물어봐 줘!"
        });
        return;
      }

      const level = data.recommendation.recommendationLevel;
      const evidence = buildEvidence(data.ragResults);

      pushMessage({
        role: "bot",
        text: `${LEVEL_REACTION[level]} ${data.recommendation.finalMessage}`,
        level,
        menu: data.selectedMeal?.items ?? [],
        steps: buildSteps(data.ragResults?.length ?? 0),
        evidence,
        showDetail: true
      });
    } catch {
      pushMessage({ role: "bot", text: "끼익! 연결이 끊겼나 봐. 다시 한 번 물어봐 줘 🐵" });
    }
  }

  async function fetchMenuByQuestion(question: string) {
    const { date, label } = resolveMenuDate(question);
    const response = await fetch(`/api/menus?date=${encodeURIComponent(date)}`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      menuDay?: { meals?: { lunch?: { items: string[] } | null; dinner?: { items: string[] } | null } };
    };
    return {
      label,
      lunch: body.menuDay?.meals?.lunch?.items ?? [],
      dinner: body.menuDay?.meals?.dinner?.items ?? []
    };
  }

  async function runMenuList(question: string) {
    try {
      const menu = await fetchMenuByQuestion(question);
      if (!menu) {
        pushMessage({ role: "bot", text: "우끼… 식단을 못 불러왔어. 잠시 후 다시!" });
        return;
      }

      // "점심"만 물었으면 점심만, "저녁"만 물었으면 저녁만 보여준다.
      const t = question.replace(/\s+/g, "");
      const wantLunch = !/저녁|석식|디너/.test(t) || /점심|중식|런치/.test(t);
      const wantDinner = !/점심|중식|런치/.test(t) || /저녁|석식|디너/.test(t);

      if (menu.lunch.length === 0 && menu.dinner.length === 0) {
        pushMessage({ role: "bot", text: `끼끼, ${menu.label}은 아직 등록된 메뉴가 없어!` });
        return;
      }

      const parts: string[] = [`${menu.label} 메뉴 끼끼! 🐵`];
      if (wantLunch && menu.lunch.length > 0) {
        parts.push(`🍴 점심: ${menu.lunch.join(" · ")}`);
      }
      if (wantDinner && menu.dinner.length > 0) {
        parts.push(`🌙 저녁: ${menu.dinner.join(" · ")}`);
      }
      pushMessage({ role: "bot", text: parts.join("\n"), showDetail: true });
    } catch {
      pushMessage({ role: "bot", text: "끼익! 연결이 끊겼나 봐. 다시 물어봐 줘 🐵" });
    }
  }

  async function runChat(question: string) {
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const body = (await response.json().catch(() => ({ reply: "" }))) as { reply?: string };
      pushMessage({ role: "bot", text: body.reply || "끼끼? 잘 모르겠어, 다시 물어봐 줘!" });
    } catch {
      pushMessage({ role: "bot", text: "끼익! 연결이 끊겼나 봐. 다시 물어봐 줘 🐵" });
    }
  }

  async function runSpicy(question: string) {
    try {
      const menu = await fetchMenuByQuestion(question);
      if (!menu) {
        pushMessage({ role: "bot", text: "우끼… 식단을 못 불러왔어. 잠시 후 다시!" });
        return;
      }
      const items = [...menu.lunch, ...menu.dinner];
      if (items.length === 0) {
        pushMessage({ role: "bot", text: `끼끼, ${menu.label}은 아직 등록된 메뉴가 없어!` });
        return;
      }
      const spicy = items.filter((item) => SPICY_KEYWORDS.some((keyword) => item.includes(keyword)));

      if (spicy.length === 0) {
        pushMessage({ role: "bot", text: `${menu.label} 메뉴엔 딱히 매운 건 안 보여! 무난해 🐵` });
        return;
      }
      pushMessage({
        role: "bot",
        text: `${menu.label} 매운 메뉴 조심! 🌶️\n${spicy.join(" · ")} 이게 매콤할 수 있어, 끼끼!`
      });
    } catch {
      pushMessage({ role: "bot", text: "끼익! 연결이 끊겼나 봐. 다시 물어봐 줘 🐵" });
    }
  }

  async function runProfile() {
    try {
      const response = await fetch("/api/profile/food");
      if (response.status === 401) {
        pushMessage({
          role: "bot",
          text: "끼끼, 아직 누군지 모르겠어! 로그인하고 알레르기·취향을 등록해줘 🐵",
          loginPrompt: true
        });
        return;
      }
      if (!response.ok) {
        pushMessage({ role: "bot", text: "우끼… 프로필을 못 불러왔어. 잠시 후 다시!" });
        return;
      }
      const body = (await response.json()) as {
        preference?: { allergyFoods?: string[]; dislikedFoods?: string[]; favoriteFoods?: string[] };
      };
      const p = body.preference;
      const allergy = p?.allergyFoods ?? [];
      const disliked = p?.dislikedFoods ?? [];
      const favorite = p?.favoriteFoods ?? [];

      if (allergy.length === 0 && disliked.length === 0 && favorite.length === 0) {
        pushMessage({
          role: "bot",
          text: "끼끼, 아직 등록된 알레르기·취향이 없어! 프로필에서 등록하면 더 잘 봐줄게 🐵"
        });
        return;
      }

      const lines = ["네 음식 프로필이야 🐵"];
      lines.push(`🚫 알레르기: ${allergy.length > 0 ? allergy.join(", ") : "없음"}`);
      lines.push(`😖 싫어함: ${disliked.length > 0 ? disliked.join(", ") : "없음"}`);
      lines.push(`😋 좋아함: ${favorite.length > 0 ? favorite.join(", ") : "없음"}`);
      pushMessage({ role: "bot", text: lines.join("\n") });
    } catch {
      pushMessage({ role: "bot", text: "끼익! 연결이 끊겼나 봐. 다시 물어봐 줘 🐵" });
    }
  }

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();

    if (!question || loading) {
      return;
    }

    pushMessage({ role: "user", text: question });
    setInput("");
    setLoading(true);

    try {
      switch (classifyIntent(question)) {
        case "greeting":
          pushMessage({ role: "bot", text: "안녕 끼끼! 🐵 오늘 메뉴 궁금하면 물어봐. 아래 버튼을 눌러도 돼!" });
          break;
        case "thanks":
          pushMessage({ role: "bot", text: "우끼끼~ 천만에! 또 궁금한 거 있으면 불러줘 🐵" });
          break;
        case "help":
          pushMessage({ role: "bot", text: HELP_TEXT });
          break;
        case "spicy":
          await runSpicy(question);
          break;
        case "menu":
          await runMenuList(question);
          break;
        case "profile":
          await runProfile();
          break;
        case "recommend":
          await runRecommend(question);
          break;
        default:
          await runChat(question);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendQuestion(input);
    }
  }

  return (
    <>
      {open ? (
        <section className="chat-panel" aria-label="정글밥 몽키 챗봇">
          <header className="chat-head">
            <span className="chat-head-avatar" aria-hidden="true">
              {MONKEY}
            </span>
            <span className="chat-head-copy">
              <strong>정글밥 몽키</strong>
              <small>오늘 메뉴 괜찮은지 끼끼 봐줄게!</small>
            </span>
            <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="닫기">
              ✕
            </button>
          </header>

          <div className="chat-body" ref={bodyRef}>
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="chat-row chat-row-user">
                  <div className="chat-bubble chat-bubble-user">{message.text}</div>
                </div>
              ) : (
                <div key={message.id} className="chat-row chat-row-bot">
                  <span className="chat-bot-avatar" aria-hidden="true">
                    {MONKEY}
                  </span>
                  <div className="chat-bubble chat-bubble-bot">
                    {message.level ? (
                      <span className={`level-chip level-chip-${LEVEL_LABEL[message.level].variant}`}>
                        {LEVEL_LABEL[message.level].label}
                      </span>
                    ) : null}
                    <p className="chat-bubble-text">{message.text}</p>
                    {message.menu && message.menu.length > 0 ? (
                      <p className="chat-bubble-menu">{message.menu.join(" · ")}</p>
                    ) : null}
                    {message.steps && message.steps.length > 0 ? (
                      <div className="chat-steps">
                        <span className="chat-steps-label">🔧 실행</span>
                        {message.steps.map((step) => (
                          <span key={step} className="chat-step">
                            {step}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {message.evidence && message.evidence.length > 0 ? (
                      <div className="chat-evidence">
                        <span className="chat-evidence-title">🔎 이 판단의 근거</span>
                        {message.evidence.map((item) =>
                          item.href ? (
                            <a key={item.id} className="chat-evidence-item" href={item.href}>
                              <span className="chat-evidence-name">{item.title}</span>
                              <span className="chat-evidence-snippet">{item.snippet}</span>
                            </a>
                          ) : (
                            <div key={item.id} className="chat-evidence-item">
                              <span className="chat-evidence-name">{item.title}</span>
                              <span className="chat-evidence-snippet">{item.snippet}</span>
                            </div>
                          )
                        )}
                      </div>
                    ) : null}
                    {message.showDetail ? (
                      <a className="chat-detail-link" href="/ai/recommend">
                        자세히 보기 →
                      </a>
                    ) : null}
                    {message.loginPrompt ? (
                      <a className="chat-detail-link" href="/login">
                        로그인하러 가기 →
                      </a>
                    ) : null}
                  </div>
                </div>
              )
            )}
            {loading ? (
              <div className="chat-row chat-row-bot">
                <span className="chat-bot-avatar" aria-hidden="true">
                  {MONKEY}
                </span>
                <div className="chat-bubble chat-bubble-bot chat-bubble-typing">끼끼… 메뉴 보는 중…</div>
              </div>
            ) : null}
          </div>

          <div className="chat-quick-replies" aria-label="빠른 질문">
            {QUICK_REPLIES.map((reply) => (
              <button
                type="button"
                key={reply}
                className="chat-quick-chip"
                onClick={() => void sendQuestion(reply)}
                disabled={loading}
              >
                {reply}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="몽키한테 메뉴 물어보기…"
              aria-label="질문 입력"
            />
            <button
              type="button"
              className="chat-send"
              onClick={() => void sendQuestion(input)}
              disabled={loading || !input.trim()}
              aria-label="보내기"
            >
              ➤
            </button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "정글밥 몽키 챗봇 닫기" : "정글밥 몽키 챗봇 열기"}
        aria-expanded={open}
      >
        <span className="chat-fab-emoji" aria-hidden="true">
          {MONKEY}
        </span>
      </button>
    </>
  );
}
