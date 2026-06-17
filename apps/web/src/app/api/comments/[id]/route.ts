import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import { assertCommentAuthor } from "@/features/comments/comment";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function statusForError(error: Error): number {
  if (error.message === "comment not found") {
    return 404;
  }

  if (error.message === "forbidden") {
    return 403;
  }

  return 400;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const existingComment = await prisma.comment.findUnique({
      where: { id },
      select: { authorId: true }
    });

    assertCommentAuthor(existingComment, user.id);

    await prisma.comment.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "comment delete failed";

    return NextResponse.json({ error: message }, { status: error instanceof Error ? statusForError(error) : 400 });
  }
}
