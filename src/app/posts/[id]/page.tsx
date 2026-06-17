import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import PostDetailApp from "@/components/post-detail-app";
import { authOptions } from "@/lib/auth";
import { getPostComments, postInclude, toFeedPosts } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)]);

  const post = await prisma.post.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    include: postInclude,
  });

  if (!post) {
    notFound();
  }

  const [[feedPost], comments] = await Promise.all([
    toFeedPosts([post], session?.user?.id),
    getPostComments(id, session?.user?.id),
  ]);

  return (
    <PostDetailApp
      initialPost={feedPost}
      initialComments={comments}
      initialSession={
        session?.user
          ? {
              user: {
                id: session.user.id,
                name: session.user.name ?? null,
                email: session.user.email ?? null,
                image: session.user.image ?? null,
              },
            }
          : null
      }
    />
  );
}
