// ③ 상품 등록 — B안 (사진 보드 + 폼). 로그인 필요.
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/product/RegisterForm";
import { currentUser } from "@/lib/auth";
import { listCategories } from "@/lib/queries/products";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.nickname) redirect("/signup");

  const categories = await listCategories();
  return <RegisterForm categories={categories} />;
}
