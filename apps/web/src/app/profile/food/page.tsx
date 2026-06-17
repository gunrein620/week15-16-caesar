import { FoodProfileForm } from "@/features/food-profile/FoodProfileForm";

export default function FoodProfilePage() {
  return (
    <>
      <section className="page-header">
        <div className="eyebrow">FoodPreference</div>
        <h1>음식 프로필</h1>
        <p className="lead">알레르기, 선호 음식, 불호 음식, 매운맛 허용 정도를 관리합니다.</p>
      </section>
      <FoodProfileForm />
    </>
  );
}
