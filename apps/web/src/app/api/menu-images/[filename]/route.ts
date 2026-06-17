import { NextResponse } from "next/server";
import { contentTypeForMenuImage, readValidMenuImageFile } from "@/features/menus/menu-image";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    filename: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { filename } = await context.params;
    const imageBytes = await readValidMenuImageFile(filename);

    return new NextResponse(new Uint8Array(imageBytes), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentTypeForMenuImage(filename)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "menu image lookup failed";
    const status = message.startsWith("menu image ") ? 400 : 404;

    return NextResponse.json({ error: message }, { status });
  }
}
