import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuthCompletePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  redirect(user.nickname ? "/" : "/signup");
}
