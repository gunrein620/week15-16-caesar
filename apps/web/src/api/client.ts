export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Post = {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  region?: { name: string; code?: string };
  category?: Category;
  author?: { nickname: string };
  tags?: Array<{ tag?: { name: string }; name?: string }>;
};

export type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    nickname: string;
  };
};

export type RagSource = {
  sourceType?: string;
  sourceId: string;
  content: string;
  similarity?: number;
  url?: string | null;
};

export type ExternalSource = {
  name: string;
  category?: string | null;
  address?: string | null;
  url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'localmind.accessToken';

let accessToken = localStorage.getItem(TOKEN_KEY) ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isAuthError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string) {
  accessToken = token;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  accessToken = '';
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      clearAccessToken();
      throw new ApiError('로그인이 만료되었습니다. 다시 로그인해주세요.', response.status);
    }
    if (response.status === 401 && path === '/auth/login') {
      throw new ApiError(data?.message ?? '이메일 또는 비밀번호를 확인해주세요.', response.status);
    }
    throw new ApiError(data?.message ?? `API ${response.status}`, response.status);
  }
  return data as T;
}

export const api = {
  async posts() {
    return request<{ items: Post[] }>('/posts?page=1&limit=20');
  },
  async categories() {
    return request<Category[]>('/categories');
  },
  async post(id: string) {
    return request<Post>(`/posts/${id}`);
  },
  async createPost(input: { title: string; content: string; categoryId: string; tagNames: string[] }) {
    return request<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  async login(input: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  async signup(input: { email: string; password: string; nickname: string }) {
    return request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  async ragAsk(question: string) {
    return request<{ answer: string; sources?: RagSource[]; externalSources?: ExternalSource[] }>(
      '/rag/ask',
      {
        method: 'POST',
        body: JSON.stringify({ question })
      }
    );
  },
  async agent(path: 'post-helper' | 'complaint-helper' | 'tag-suggestion' | 'duplicate-check', input: string) {
    return request<{ answer: string; status: string; tags?: string[] }>(`/agent/${path}`, {
      method: 'POST',
      body: JSON.stringify({ input })
    });
  }
};

export const fallbackCategories: Category[] = [
  { id: 'restaurant', name: '맛집 추천', slug: 'restaurant' },
  { id: 'lost', name: '분실물', slug: 'lost' },
  { id: 'market', name: '중고거래', slug: 'market' },
  { id: 'event', name: '동네 행사', slug: 'event' },
  { id: 'complaint', name: '생활 민원', slug: 'complaint' },
  { id: 'facility', name: '병원/약국', slug: 'facility' }
];

export const fallbackPosts: Post[] = [
  {
    id: 'sample-1',
    title: '오산역 근처 야간 약국 공유해요',
    content: '어제 밤에 급하게 찾았던 약국 정보입니다. 운영 시간과 위치 같이 남겨둘게요.',
    category: fallbackCategories[5],
    region: { name: '오산동', code: 'OSAN_DONG' },
    author: { nickname: '오산지기' },
    viewCount: 142,
    likeCount: 18,
    commentCount: 6,
    tags: [{ tag: { name: '야간약국' } }, { tag: { name: '생활정보' } }]
  },
  {
    id: 'sample-2',
    title: '궐동 골목 불법 주차 너무 심해요',
    content: '아침마다 보행로를 막고 있어서 민원 넣으려고 합니다. 비슷한 경험 있으신가요?',
    category: fallbackCategories[4],
    region: { name: '궐동', code: 'GWOL_DONG' },
    author: { nickname: '출근러' },
    viewCount: 386,
    likeCount: 31,
    commentCount: 14,
    tags: [{ tag: { name: '생활민원' } }]
  },
  {
    id: 'sample-3',
    title: '세교동 플리마켓 이번 주말 열릴까요?',
    content: '날씨가 애매해서 실내 대안이 필요할지 궁금합니다. 참여하실 분들도 댓글 남겨주세요.',
    category: fallbackCategories[3],
    region: { name: '세교동', code: 'SEGYO_DONG' },
    author: { nickname: '마켓준비' },
    viewCount: 721,
    likeCount: 44,
    commentCount: 22,
    tags: [{ tag: { name: '동네행사' } }, { tag: { name: 'AI추천' } }]
  }
];
