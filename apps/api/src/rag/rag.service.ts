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
    const candidates = rows
      .filter((row) => row.sourceId !== dto.excludePostId && row.similarity >= 0.86)
      .map((row) => this.toSource(row));

    return {
      isDuplicate: candidates.length > 0,
      candidates,
      duplicateCandidates: candidates
    };
  }

  async findSimilarPosts(dto: RagPostTextDto) {
    const regionId = await this.resolveRegionId(dto.regionId);
    const embedding = await this.embeddingService.createEmbedding(this.postText(dto));
    const candidates = (
      await this.vectorSearchService.search({
        embedding,
        regionId,
        limit: dto.topK ?? 5,
        sourceTypes: [EmbeddingSourceType.POST]
      })
    )
      .filter((row) => row.sourceId !== dto.excludePostId && row.similarity >= 0.7)
      .map((row) => this.toSource(row));

    return { candidates };
  }

  async ask(dto: RagAskDto) {
    const regionId = await this.resolveRegionId(dto.regionId);
    const embedding = await this.embeddingService.createEmbedding(dto.question);
    const sources = (
      await this.vectorSearchService.search({
        embedding,
        regionId,
        limit: dto.topK ?? 5
      })
    ).map((row) => this.toSource(row));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '너는 오산 지역 생활 커뮤니티 LocalMind Board의 Q&A 봇이다. 제공된 게시글/댓글/공지 근거만 사용하고, 불확실하면 관련 글 확인을 안내한다.'
      },
      {
        role: 'user',
        content: [
          `질문: ${dto.question}`,
          '검색된 근거:',
          sources.map((source, index) => `${index + 1}. [${source.sourceType}] ${source.content}`).join('\n')
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
}
