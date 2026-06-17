import { ReviewDetailClient } from "@/features/reviews/ReviewDetailClient";

type ReviewDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { id } = await params;

  return <ReviewDetailClient reviewId={id} />;
}
