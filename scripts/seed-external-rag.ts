import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import {
  EXTERNAL_SNACK_RAG_SOURCE_TYPE,
  externalSnackRagSources,
} from "../src/lib/ai/external-rag-sources";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/jungle_snack_court?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

async function main() {
  const results = [];

  for (const source of externalSnackRagSources) {
    const crawlResult = await crawlPublicSource(source.sourceUrl);
    const metadata = {
      sourceUrl: source.sourceUrl,
      publisher: source.publisher,
      category: source.category,
      tags: source.tags,
      crawledAt: new Date().toISOString(),
      crawlStatus: crawlResult.status,
      httpStatus: crawlResult.httpStatus,
      fetchedTitle: crawlResult.title,
      fetchedDescription: crawlResult.description,
      storagePolicy:
        "Only a project-authored summary is stored. The remote article body is not copied into the database.",
    } satisfies Prisma.InputJsonObject;

    const document = await prisma.ragDocument.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: EXTERNAL_SNACK_RAG_SOURCE_TYPE,
          sourceId: source.sourceId,
        },
      },
      update: {
        title: source.title,
        content: source.content,
        metadata,
      },
      create: {
        sourceType: EXTERNAL_SNACK_RAG_SOURCE_TYPE,
        sourceId: source.sourceId,
        title: source.title,
        content: source.content,
        metadata,
      },
    });

    results.push({
      id: document.id,
      title: document.title,
      crawlStatus: crawlResult.status,
      httpStatus: crawlResult.httpStatus,
    });
  }

  console.table(results);
  console.log(`Seeded ${results.length} external snack RAG documents.`);
}

async function crawlPublicSource(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "jungle-snack-court-rag-seeder/1.0",
      },
      signal: controller.signal,
    });
    const html = await response.text();

    return {
      status: response.ok ? "ok" : "http_error",
      httpStatus: response.status,
      title: readHtmlTitle(html),
      description: readMetaDescription(html),
    };
  } catch (error) {
    return {
      status: error instanceof Error ? `failed: ${error.name}` : "failed",
      httpStatus: null,
      title: null,
      description: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readHtmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).trim().slice(0, 240) : null;
}

function readMetaDescription(html: string) {
  const match =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i,
    );

  return match ? decodeHtml(match[1]).trim().slice(0, 500) : null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
    .replace(/\s+/g, " ");
}

main()
  .catch((error) => {
    console.error("External snack RAG seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
