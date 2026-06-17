import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { buildRagFallbackQueries, normalizeRagSearchQuery } from "@/features/rag/chunk";
import { findSemanticRagResults } from "@/features/rag/embedding";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = normalizeRagSearchQuery({
      query: url.searchParams.get("query"),
      limit: url.searchParams.get("limit")
    });

    const semanticResults = await findSemanticRagResults(prisma, input.query, input.limit);

    if (semanticResults) {
      return NextResponse.json({
        query: input.query,
        searchMode: "semantic",
        results: semanticResults
      });
    }

    const results = await prisma.reviewChunk.findMany({
      where: {
        content: {
          contains: input.query,
          mode: "insensitive"
        }
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
        review: {
          select: {
            id: true,
            title: true,
            rating: true,
            menuNames: true,
            author: {
              select: {
                name: true
              }
            }
          }
        },
        comment: {
          select: {
            id: true,
            reviewId: true,
            author: {
              select: {
                name: true
              }
            },
            review: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      }
    });

    if (results.length > 0) {
      return NextResponse.json({
        query: input.query,
        searchMode: "text",
        results
      });
    }

    const fallbackQueries = buildRagFallbackQueries(input.query);
    const fallbackResults =
      fallbackQueries.length > 0
        ? await prisma.reviewChunk.findMany({
            where: {
              OR: fallbackQueries.map((query) => ({
                content: {
                  contains: query,
                  mode: "insensitive" as const
                }
              }))
            },
            orderBy: { createdAt: "desc" },
            take: input.limit,
            select: {
              id: true,
              content: true,
              metadata: true,
              createdAt: true,
              review: {
                select: {
                  id: true,
                  title: true,
                  rating: true,
                  menuNames: true,
                  author: {
                    select: {
                      name: true
                    }
                  }
                }
              },
              comment: {
                select: {
                  id: true,
                  reviewId: true,
                  author: {
                    select: {
                      name: true
                    }
                  },
                  review: {
                    select: {
                      id: true,
                      title: true
                    }
                  }
                }
              }
            }
          })
        : [];

    return NextResponse.json({
      query: input.query,
      searchMode: fallbackResults.length > 0 ? "keyword" : "text",
      results: fallbackResults
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "rag search failed";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
