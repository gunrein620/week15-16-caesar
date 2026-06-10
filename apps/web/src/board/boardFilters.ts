import type { Post } from '../api/client.js';

export type BoardCategory = '동네생활' | '모임' | '카페' | '아파트' | '게임' | '맛집/음식';
export type BoardFilter = '추천' | '인기' | '투표' | '생활정보' | 'AI추천';

export type BoardFeedState = {
  category: BoardCategory;
  filter: BoardFilter;
};

export const boardCategories: BoardCategory[] = ['동네생활', '모임', '카페', '아파트', '게임', '맛집/음식'];
export const boardFilters: BoardFilter[] = ['추천', '인기', '투표', '생활정보', 'AI추천'];

export function selectBoardPosts(posts: Post[], state: BoardFeedState) {
  const categoryMatched = posts.filter((post) => matchesCategory(post, state.category));
  const filterMatched = categoryMatched.filter((post) => matchesFilter(post, state.filter));
  const fallbackMatched =
    filterMatched.length === 0 && (state.filter === '추천' || state.filter === '인기') ? categoryMatched : filterMatched;
  return sortPosts(fallbackMatched, state.filter);
}

export function boardFilterLabel(filter: BoardFilter) {
  const labels: Record<BoardFilter, string> = {
    추천: '추천순',
    인기: '인기순',
    투표: '투표',
    생활정보: '생활정보',
    AI추천: 'AI추천'
  };
  return labels[filter];
}

export function emptyFeedMessage(state: BoardFeedState) {
  if (state.filter === '투표') {
    return '아직 투표 게시글이 없습니다. 첫 투표 글을 올려보세요.';
  }
  return `${state.category} · ${state.filter} 조건에 맞는 게시글이 아직 없습니다.`;
}

function matchesCategory(post: Post, category: BoardCategory) {
  if (category === '동네생활') {
    return true;
  }
  const text = postSearchText(post);
  const categoryRules: Record<Exclude<BoardCategory, '동네생활'>, RegExp> = {
    모임: /(모임|동호회|같이|참여|번개|만나요)/,
    카페: /(카페|커피|디저트|빵|베이커리)/,
    아파트: /(아파트|입주|관리비|단지|관리사무소)/,
    게임: /(게임|보드게임|PC방|피시방|플레이)/,
    '맛집/음식': /(맛집|식당|음식|밥집|족발|분식|가족식사|카페)/
  };
  return categoryRules[category].test(text);
}

function matchesFilter(post: Post, filter: BoardFilter) {
  const text = postSearchText(post);
  const tags = postTags(post);
  if (filter === '추천') {
    return tags.includes('추천');
  }
  if (filter === '인기') {
    return tags.includes('인기');
  }
  if (filter === '투표') {
    return tags.includes('투표') || /(투표|설문|찬반|골라|선택|의견\s*모아)/.test(text);
  }
  if (filter === '생활정보') {
    return tags.includes('생활정보');
  }
  return tags.includes('AI추천');
}

function sortPosts(posts: Post[], filter: BoardFilter) {
  const nextPosts = [...posts];
  if (filter === '인기') {
    return nextPosts.sort(
      (left, right) => popularityScore(right) - popularityScore(left) || left.title.localeCompare(right.title, 'ko')
    );
  }
  if (filter === 'AI추천') {
    return nextPosts.sort((left, right) => aiScore(right) - aiScore(left));
  }
  return nextPosts;
}

function popularityScore(post: Post) {
  return (post.likeCount ?? 0) * 3 + (post.commentCount ?? 0) * 2 + (post.viewCount ?? 0);
}

function aiScore(post: Post) {
  const text = postSearchText(post);
  let score = popularityScore(post);
  if (/AI|RAG/i.test(text)) {
    score += 30;
  }
  if (/(플리마켓|약국|민원|분실물|날씨)/.test(text)) {
    score += 20;
  }
  if (postTags(post).includes('AI추천')) {
    score += 50;
  }
  return score;
}

function postSearchText(post: Post) {
  return [post.title, post.content, post.category?.name, post.category?.slug, post.region?.name, ...postTags(post)]
    .filter(Boolean)
    .join(' ');
}

function postTags(post: Post) {
  return (post.tags ?? [])
    .map((postTag) => postTag.tag?.name ?? postTag.name)
    .filter((tag): tag is string => Boolean(tag));
}
