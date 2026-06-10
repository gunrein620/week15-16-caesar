type PostWithCounts = {
  _count?: {
    comments?: number;
    likes?: number;
  };
};

export function mapPostWithCounts<T extends PostWithCounts>(post: T) {
  const { _count, ...rest } = post;
  return {
    ...rest,
    commentCount: _count?.comments ?? 0,
    likeCount: _count?.likes ?? 0
  };
}
