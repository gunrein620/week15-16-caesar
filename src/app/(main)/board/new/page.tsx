// 게시판 글쓰기 — 로그인 필요
import { redirect } from "next/navigation";
import { PostForm } from "@/components/board/PostForm";
import { currentUser } from "@/lib/auth";
import { listPopularTags } from "@/lib/queries/posts";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.nickname) redirect("/signup");

  const tags = await listPopularTags();
  return <PostForm tags={tags.map((t) => t.name)} />;
}
