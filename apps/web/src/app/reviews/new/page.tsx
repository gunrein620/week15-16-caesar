import Link from "next/link";
import { ReviewForm } from "@/features/reviews/ReviewForm";

export default function NewReviewPage() {
  return (
    <>
      <section className="page-header">
        <div className="eyebrow">New Review</div>
        <h1>후기 작성</h1>
        <p className="lead">메뉴명과 태그를 함께 남기면 나중에 RAG 검색 품질이 좋아집니다.</p>
      </section>
      <ReviewForm mode="create" />
      <p className="helper-text">
        <Link href="/reviews">목록으로 돌아가기</Link>
      </p>
    </>
  );
}
