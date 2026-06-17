import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { postInclude, toFeedPosts } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import type { StoredImage } from "@/lib/storage";
import { deletePostImages, savePostImages } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const databaseSetupMessage =
  "데이터베이스 연결 또는 마이그레이션이 필요합니다. DATABASE_URL을 확인하고 npx prisma migrate dev --name init을 실행해주세요.";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "true" || value === "on";
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, 8);
}

function getImageFiles(formData: FormData) {
  return formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  try {
    const posts = await prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
      orderBy: {
        createdAt: "desc",
      },
      include: postInclude,
      take: 50,
    });

    return NextResponse.json({
      posts: await toFeedPosts(posts, session?.user?.id),
    });
  } catch {
    return NextResponse.json(
      {
        posts: [],
        message: databaseSetupMessage,
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const snackName = getString(formData, "snackName");
  const reason = getString(formData, "reason") || getString(formData, "excuse");
  const ateLunch = getBoolean(formData, "ateLunch") || getBoolean(formData, "hadLunch");
  const ateDinner = getBoolean(formData, "ateDinner") || getBoolean(formData, "hadDinner");
  const tags = parseTags(getString(formData, "tags"));
  const mealMenuId = getString(formData, "mealMenuId");
  const files = getImageFiles(formData);

  if (!snackName) {
    return NextResponse.json({ message: "간식 이름을 적어주세요." }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ message: "먹은 이유를 적어주세요." }, { status: 400 });
  }

  let storedImages: StoredImage[] | undefined;

  try {
    const savedImages = await savePostImages(files);
    storedImages = savedImages;

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          snackName,
          reason,
          ateLunch,
          ateDinner,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          authorId: session.user.id,
          images: {
            create: savedImages.map((image) => ({
              url: image.url,
              filename: image.filename,
              contentType: image.contentType,
              size: image.size,
              sortOrder: image.sortOrder,
              storageType: image.storageType,
              storageKey: image.storageKey,
              sourceUrl: image.sourceUrl,
              altText: image.altText,
              width: image.width,
              height: image.height,
              metadata: image.metadata,
            })),
          },
          tags: tags.length
            ? {
                create: tags.map((name) => ({
                  tag: {
                    connectOrCreate: {
                      where: { name },
                      create: { name },
                    },
                  },
                })),
              }
            : undefined,
        },
      });

      if (mealMenuId) {
        const meal = await tx.mealMenu.findUnique({
          where: {
            id: mealMenuId,
          },
          select: {
            id: true,
            mealType: true,
          },
        });

        if (meal) {
          await tx.postMealContext.create({
            data: {
              postId: created.id,
              ateLunch,
              ateDinner,
              lunchMenuId: meal.mealType === "LUNCH" ? meal.id : undefined,
              dinnerMenuId: meal.mealType === "DINNER" ? meal.id : undefined,
            },
          });
        }
      }

      return tx.post.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: postInclude,
      });
    });

    const [feedPost] = await toFeedPosts([post], session.user.id);
    return NextResponse.json({ post: feedPost }, { status: 201 });
  } catch (error) {
    if (storedImages) {
      await deletePostImages(storedImages.map((image) => image.url));
    }

    const message =
      error instanceof Error ? error.message : "포스트 작성 중 문제가 생겼습니다.";
    const status = message.includes("이미지") || message.includes("jpg") ? 400 : 500;

    return NextResponse.json({ message }, { status });
  }
}
