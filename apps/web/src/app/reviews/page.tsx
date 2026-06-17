import { ReviewsClient } from "@/features/reviews/ReviewsClient";

export default function ReviewsPage() {
  return (
    <>
      <section className="page-header">
        <div className="eyebrow">Review</div>
        <h1>식단 후기</h1>
        <p className="lead">먹어본 메뉴의 후기와 태그를 남기고, 나중에 AI 추천의 근거 데이터로 활용합니다.</p>
      </section>
      <ReviewsClient />
    </>
  );
}
