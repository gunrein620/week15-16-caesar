import { getServerSession } from "next-auth";

import PostComposerApp from "@/components/post-composer-app";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const session = await getServerSession(authOptions);

  return (
    <PostComposerApp
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
