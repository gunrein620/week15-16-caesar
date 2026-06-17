import { MenusClient } from "@/features/menus/MenusClient";

export default function MenusPage() {
  return (
    <>
      <section className="page-header">
        <div className="eyebrow">MenuArchive</div>
        <h1>식단</h1>
        <p className="lead">날짜와 점심/저녁 단위로 저장된 식단을 보여줍니다.</p>
      </section>
      <MenusClient />
    </>
  );
}
