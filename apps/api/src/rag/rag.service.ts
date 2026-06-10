import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EmbeddingSourceType, PostStatus } from '@prisma/client';
import type { ChatMessage } from '../ai/llm.service.js';
import { LlmService } from '../ai/llm.service.js';
import { DEFAULT_REGION_CODE } from '../common/default-region.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from './embedding.service.js';
import type { RagAskDto } from './dto/rag-ask.dto.js';
import type { RagPostTextDto } from './dto/rag-post-text.dto.js';
import type { RegionalIssuesQuery } from './dto/regional-issues.query.js';
import { VectorSearchService, type VectorSearchResult } from './vector-search.service.js';

type RagSource = VectorSearchResult & {
  url: string | null;
};

type KeywordPost = {
  id: string;
  title: string;
  content: string;
  regionId: string | null;
  category: { name: string };
  region: { name: string };
  tags: Array<{ tag: { name: string } }>;
};

@Injectable()
export class RagService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmbeddingService) private readonly embeddingService: EmbeddingService,
    @Inject(VectorSearchService) private readonly vectorSearchService: VectorSearchService,
    @Inject(LlmService) private readonly llmService: LlmService
  ) {}

  async checkDuplicate(dto: RagPostTextDto) {
    const regionId = await this.resolveRegionId(dto.regionId);
    const embedding = await this.embeddingService.createEmbedding(this.postText(dto));
    const rows = await this.vectorSearchService.search({
      embedding,
      regionId,
      limit: dto.topK ?? 5,
      sourceTypes: [EmbeddingSourceType.POST]
    });
    let candidates = rows
      .filter((row) => row.sourceId !== dto.excludePostId && row.similarity >= 0.86)
      .map((row) => this.toSource(row));
    if (candidates.length === 0) {
      candidates = (await this.keywordPostSources(this.postText(dto), regionId, dto.topK ?? 5)).filter(
        (source) => source.sourceId !== dto.excludePostId
      );
    }

    return {
      isDuplicate: candidates.length > 0,
      candidates,
      duplicateCandidates: candidates
    };
  }

  async findSimilarPosts(dto: RagPostTextDto) {
    const regionId = await this.resolveRegionId(dto.regionId);
    const embedding = await this.embeddingService.createEmbedding(this.postText(dto));
    let candidates = (
      await this.vectorSearchService.search({
        embedding,
        regionId,
        limit: dto.topK ?? 5,
        sourceTypes: [EmbeddingSourceType.POST]
      })
    )
      .filter((row) => row.sourceId !== dto.excludePostId && row.similarity >= 0.7)
      .map((row) => this.toSource(row));
    if (candidates.length === 0) {
      candidates = (await this.keywordPostSources(this.postText(dto), regionId, dto.topK ?? 5)).filter(
        (source) => source.sourceId !== dto.excludePostId
      );
    }

    return { candidates };
  }

  async ask(dto: RagAskDto) {
    const regionId = await this.resolveRegionId(dto.regionId);
    const embedding = await this.embeddingService.createEmbedding(dto.question);
    const questionTerms = this.keywordTerms(dto.question);
    let sources = (
      await this.vectorSearchService.search({
        embedding,
        regionId,
        limit: dto.topK ?? 5
      })
    ).map((row) => this.toSource(row));
    const directlyMatchedSources = sources.filter((source) =>
      questionTerms.some((term) => source.content.includes(term))
    );
    if (directlyMatchedSources.length > 0) {
      sources = directlyMatchedSources;
    }
    if (sources.length === 0) {
      sources = await this.keywordPostSources(dto.question, regionId, dto.topK ?? 5);
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '너는 오산 지역 생활 커뮤니티 LocalMind Board의 Q&A 봇이다. 제공된 게시글/댓글/공지 근거만 사용한다. 근거에 관련 게시글이 있으면 반드시 제목이나 내용을 언급하고, 정확한 위치나 운영시간이 근거에 없으면 추가 확인이 필요하다고 말한다.'
      },
      {
        role: 'user',
        content: [
          `질문: ${dto.question}`,
          '검색된 근거:',
          sources.length > 0
            ? sources.map((source, index) => `${index + 1}. [${source.sourceType}] ${source.content}`).join('\n')
            : '관련 근거 없음'
        ].join('\n\n')
      }
    ];

    const answer = await this.llmService.chat(messages, { temperature: 0.2 });
    return { answer, sources };
  }

  async summarizeRegionalIssues(query: RegionalIssuesQuery) {
    const regionId = await this.resolveRegionId(query.regionId);
    const days = query.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: {
        regionId,
        status: PostStatus.PUBLISHED,
        createdAt: {
          gte: since
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true
      }
    });

    if (posts.length === 0) {
      return {
        summary: '최근 지역 이슈로 요약할 게시글이 아직 충분하지 않습니다.',
        posts: []
      };
    }

    const answer = await this.llmService.chat(
      [
        {
          role: 'system',
          content: '너는 지역 커뮤니티 게시글을 짧고 구체적으로 요약하는 분석 도우미다.'
        },
        {
          role: 'user',
          content: posts
            .map((post, index) => `${index + 1}. ${post.title}\n${post.content}`)
            .join('\n\n')
        }
      ],
      { temperature: 0.2 }
    );
    return { summary: answer, posts };
  }

  private async resolveRegionId(regionId?: string) {
    if (regionId) {
      return regionId;
    }
    const region = await this.prisma.region.findUnique({
      where: { code: DEFAULT_REGION_CODE }
    });
    if (!region) {
      throw new NotFoundException('기본 지역을 찾을 수 없습니다.');
    }
    return region.id;
  }

  private postText(dto: RagPostTextDto) {
    return [dto.title, dto.content].filter(Boolean).join('\n');
  }

  private toSource(row: VectorSearchResult): RagSource {
    return {
      ...row,
      url: row.sourceType === EmbeddingSourceType.POST ? `/posts/${row.sourceId}` : null
    };
  }

  private async keywordPostSources(question: string, regionId: string, limit: number): Promise<RagSource[]> {
    const terms = this.keywordTerms(question);
    if (terms.length === 0) {
      return [];
    }
    const posts = await this.prisma.post.findMany({
      where: {
        regionId,
        status: PostStatus.PUBLISHED,
        OR: terms.flatMap((term) => [{ title: { contains: term } }, { content: { contains: term } }])
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 10),
      select: {
        id: true,
        title: true,
        content: true,
        regionId: true,
        category: {
          select: { name: true }
        },
        region: {
          select: { name: true }
        },
        tags: {
          select: {
            tag: {
              select: { name: true }
            }
          }
        }
      }
    });

    const minimumMatches = terms.length >= 2 ? 2 : 1;
    return posts
      .map((post) => ({
        post,
        matchCount: this.keywordMatchCount(this.keywordPostSearchText(post), terms)
      }))
      .filter((item) => item.matchCount >= minimumMatches)
      .sort((left, right) => right.matchCount - left.matchCount)
      .map((item) => this.keywordPostToSource(item.post));
  }

  private keywordTerms(question: string) {
    const stopWords = new Set([
      '근처',
      '어디',
      '있어',
      '있나요',
      '알려줘',
      '알려주세요',
      '추천',
      '해줘',
      '혹시',
      '공유',
      '정보',
      '확인',
      '찾습니다',
      '모아봐요',
      '주변',
      '오산',
      '오산시'
    ]);
    return [
      ...new Set(
        question
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2 && !stopWords.has(term))
      )
    ].slice(0, 6);
  }

  private keywordPostToSource(post: KeywordPost): RagSource {
    const tags = post.tags.map((postTag) => postTag.tag.name).join(', ');
    return {
      id: `keyword-post-${post.id}`,
      sourceType: EmbeddingSourceType.POST,
      sourceId: post.id,
      regionId: post.regionId,
      similarity: 0,
      url: `/posts/${post.id}`,
      content: [
        '[게시글]',
        `제목: ${post.title}`,
        `지역: ${post.region.name}`,
        `카테고리: ${post.category.name}`,
        tags ? `태그: ${tags}` : null,
        `내용: ${post.content}`
      ]
        .filter(Boolean)
        .join('\n')
    };
  }

  private keywordPostSearchText(post: KeywordPost) {
    return [
      post.title,
      post.content,
      post.category.name,
      post.region.name,
      ...post.tags.map((postTag) => postTag.tag.name)
    ].join(' ');
  }

  private keywordMatchCount(text: string, terms: string[]) {
    return terms.filter((term) => text.includes(term)).length;
  }
}
