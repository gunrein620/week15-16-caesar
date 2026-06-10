import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EmbeddingSourceType, PostStatus } from '@prisma/client';
import type { ChatMessage, WebSearchResult } from '../ai/llm.service.js';
import { LlmService } from '../ai/llm.service.js';
import { DEFAULT_REGION_CODE, DEFAULT_REGION_NAME } from '../common/default-region.js';
import { McpClientService } from '../mcp-client/mcp-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from './embedding.service.js';
import type { RagAskDto } from './dto/rag-ask.dto.js';
import type { RagPostTextDto } from './dto/rag-post-text.dto.js';
import type { RegionalIssuesQuery } from './dto/regional-issues.query.js';
import { VectorSearchService, type VectorSearchResult } from './vector-search.service.js';

type RagSource = VectorSearchResult & {
  url: string | null;
};

type ExternalPlaceSource = {
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  url?: string;
  latitude?: number;
  longitude?: number;
  source: string;
  openingHours?: string;
  hoursSourceUrl?: string;
  hoursSourceTitle?: string;
};

type PlaceSearchIntent = {
  region: string;
  keyword: string;
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
    @Inject(LlmService) private readonly llmService: LlmService,
    @Optional() @Inject(McpClientService) private readonly mcpClientService?: McpClientService
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
    const placeIntent = this.detectPlaceSearchIntent(dto.question);
    const externalSources = placeIntent
      ? await this.enrichPlacesWithOperatingHours(await this.searchExternalPlaces(placeIntent), dto.question)
      : [];
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
        content: placeIntent
          ? '너는 오산 지역 생활 커뮤니티 LocalMind Board의 Q&A 봇이다. 약국, 마트, 병원, 주차장 같은 장소 질문은 외부 장소 검색 결과를 1차 근거로 사용한다. 운영시간이 제공된 장소는 운영시간과 출처 링크를 함께 안내한다. 게시글/댓글/공지 근거는 주민 후기나 보조 설명으로만 덧붙인다. 운영시간, 야간 운영 여부, 전화번호가 근거에 없으면 확인 필요하다고 말하고, 없는 정보를 지어내지 않는다.'
          : '너는 오산 지역 생활 커뮤니티 LocalMind Board의 Q&A 봇이다. 제공된 게시글/댓글/공지 근거만 사용한다. 근거에 관련 게시글이 있으면 반드시 제목이나 내용을 언급하고, 정확한 위치나 운영시간이 근거에 없으면 추가 확인이 필요하다고 말한다.'
      },
      {
        role: 'user',
        content: [
          `질문: ${dto.question}`,
          placeIntent ? '외부 장소 검색 결과:' : null,
          placeIntent
            ? externalSources.length > 0
              ? this.formatExternalPlaceSources(externalSources)
              : '외부 장소 검색 결과 없음. 게시판 근거만으로 답하되, 실제 위치 확인이 필요하다고 안내한다.'
            : null,
          placeIntent ? '게시판 보조 근거:' : '검색된 근거:',
          sources.length > 0
            ? sources.map((source, index) => `${index + 1}. [${source.sourceType}] ${source.content}`).join('\n')
            : '관련 근거 없음'
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    ];

    const answer = await this.llmService.chat(messages, { temperature: 0.2 });
    return externalSources.length > 0 ? { answer, sources, externalSources } : { answer, sources };
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

  private detectPlaceSearchIntent(question: string): PlaceSearchIntent | null {
    const normalizedQuestion = question.replace(/\s+/g, ' ').trim();
    const keyword = this.placeKeyword(normalizedQuestion);
    if (!keyword) {
      return null;
    }

    return {
      region: this.placeRegion(normalizedQuestion),
      keyword
    };
  }

  private placeKeyword(question: string) {
    const keywordRules: Array<{ keyword: string; terms: string[] }> = [
      { keyword: '약국', terms: ['야간 약국', '야간약국', '약국'] },
      { keyword: '마트', terms: ['대형마트', '마트', '슈퍼마켓', '슈퍼'] },
      { keyword: '편의점', terms: ['편의점'] },
      { keyword: '동물병원', terms: ['동물병원'] },
      { keyword: '병원', terms: ['응급실', '병원'] },
      { keyword: '주차장', terms: ['공영주차장', '주차장', '주차'] },
      { keyword: '카페', terms: ['카페'] },
      { keyword: '식당', terms: ['맛집', '식당', '음식점'] },
      { keyword: '도서관', terms: ['도서관'] }
    ];

    return keywordRules.find((rule) => rule.terms.some((term) => question.includes(term)))?.keyword ?? null;
  }

  private placeRegion(question: string) {
    const regionHints = [
      '오산역',
      '세교동',
      '원동',
      '궐동',
      '금암동',
      '수청동',
      '부산동',
      '은계동',
      '내삼미동',
      '외삼미동',
      '갈곶동',
      '고현동',
      '가수동',
      '청학동',
      '양산동',
      '누읍동',
      '탑동',
      '서동',
      '오산동',
      '대원동',
      '남촌동',
      '신장동',
      '중앙동'
    ];
    const matchedHint = regionHints.find((hint) => question.includes(hint));
    if (!matchedHint) {
      return DEFAULT_REGION_NAME;
    }
    return matchedHint.endsWith('동') ? `${DEFAULT_REGION_NAME} ${matchedHint}` : matchedHint;
  }

  private async searchExternalPlaces(intent: PlaceSearchIntent): Promise<ExternalPlaceSource[]> {
    if (!this.mcpClientService) {
      return [];
    }

    try {
      const result = await this.mcpClientService.callTool('search_public_facility', intent);
      return this.toExternalPlaceSources(result);
    } catch {
      return [];
    }
  }

  private toExternalPlaceSources(result: unknown): ExternalPlaceSource[] {
    if (!result || typeof result !== 'object') {
      return [];
    }

    const payload = result as { source?: unknown; facilities?: unknown };
    if (!Array.isArray(payload.facilities)) {
      return [];
    }

    const source = this.stringValue(payload.source) ?? 'external-place';
    return payload.facilities
      .flatMap((facility) => {
        if (!facility || typeof facility !== 'object') {
          return [];
        }
        const candidate = facility as Record<string, unknown>;
        const name = this.stringValue(candidate.name);
        if (!name) {
          return [];
        }
        return [
          {
            name,
            category: this.stringValue(candidate.category),
            address: this.stringValue(candidate.address),
            url: this.stringValue(candidate.url),
            phone: this.stringValue(candidate.phone),
            latitude: this.numberValue(candidate.latitude),
            longitude: this.numberValue(candidate.longitude),
            source
          }
        ];
      })
      .slice(0, 5);
  }

  private async enrichPlacesWithOperatingHours(
    places: ExternalPlaceSource[],
    question: string
  ): Promise<ExternalPlaceSource[]> {
    if (places.length === 0 || !this.hasOperatingHoursIntent(question)) {
      return places;
    }

    const enrichedPlaces = await Promise.all(
      places.map(async (place, index) => {
        if (index >= 3) {
          return place;
        }

        try {
          const result = await this.llmService.searchWeb(this.operatingHoursSearchPrompt(place, question));
          return {
            ...place,
            ...this.toOperatingHours(result)
          };
        } catch {
          return place;
        }
      })
    );
    return enrichedPlaces;
  }

  private hasOperatingHoursIntent(question: string) {
    return /(운영\s*시간|영업\s*시간|진료\s*시간|몇\s*시|언제\s*(열|닫|까지)|지금|현재|문\s*(열|닫)|열어|열려|열었|닫아|닫혀|휴무|휴일|공휴일|야간|심야|밤|새벽|24\s*시간|24시)/i.test(
      question
    );
  }

  private operatingHoursSearchPrompt(place: ExternalPlaceSource, question: string) {
    return [
      `${place.name} ${place.address ?? DEFAULT_REGION_NAME} 영업시간 운영시간 휴무`,
      `사용자 질문: ${question}`,
      '해당 장소의 현재 영업시간을 웹 검색으로 확인한다.',
      '확실한 운영시간을 찾으면 JSON만 반환한다: {"openingHours":"예: 매일 10:00-22:00","sourceUrl":"출처 URL","sourceTitle":"출처 제목"}',
      '운영시간이 확실하지 않으면 JSON만 반환한다: {"openingHours":null}'
    ].join('\n');
  }

  private toOperatingHours(result: WebSearchResult): Partial<ExternalPlaceSource> {
    const parsed = this.parseJsonObject(result.text);
    const openingHours = this.stringValue(parsed?.openingHours) ?? this.stringValue(parsed?.operatingHours);
    if (!openingHours) {
      return {};
    }

    const firstCitation = result.citations[0];
    return {
      openingHours,
      hoursSourceUrl: this.stringValue(parsed?.sourceUrl) ?? firstCitation?.url,
      hoursSourceTitle: this.stringValue(parsed?.sourceTitle) ?? firstCitation?.title
    };
  }

  private parseJsonObject(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    const jsonText = trimmed.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private formatExternalPlaceSources(sources: ExternalPlaceSource[]) {
    return sources
      .map((source, index) =>
        [
          `${index + 1}. ${source.name}`,
          source.category ? `분류: ${source.category}` : null,
          source.address ? `주소: ${source.address}` : null,
          source.phone ? `전화: ${source.phone}` : null,
          source.openingHours ? `운영시간: ${source.openingHours}` : null,
          source.hoursSourceUrl ? `운영시간 출처: ${source.hoursSourceUrl}` : null,
          source.url ? `링크: ${source.url}` : null,
          `출처: ${source.source}`
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n\n');
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
