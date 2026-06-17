import { AgentRecommendClient } from "@/features/agent/AgentRecommendClient";

export default function AiRecommendPage() {
  return (
    <>
      <section className="page-header">
        <div className="eyebrow">AI Agent</div>
        <h1>오늘 메뉴 나한테 괜찮아?</h1>
        <p className="lead">오늘 식단, 내 음식 프로필, 후기 근거를 함께 보고 바로 판단합니다.</p>
      </section>
      <AgentRecommendClient />
    </>
  );
}
