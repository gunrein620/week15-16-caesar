// GET /api/products — 목록 (검색 q · 카테고리 · 페이징) / POST — 등록
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProducts } from "@/lib/queries/products";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const take = Math.min(50, Number(url.searchParams.get("take")) || 20);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const products = await listProducts({ q, category, take, skip: (page - 1) * take });
  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const price = Number(body?.price);
  const categoryId = Number(body?.categoryId);

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!Number.isInteger(price) || price < 0) {
    return NextResponse.json({ error: "invalid price" }, { status: 400 });
  }
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ error: "invalid category" }, { status: 400 });

  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  const product = await prisma.product.create({
    data: {
      title,
      description,
      price,
      categoryId,
      sellerId: session.user.id,
      location: me?.town ?? "동네 미설정",
    },
  });
  return NextResponse.json(product, { status: 201 });
}
