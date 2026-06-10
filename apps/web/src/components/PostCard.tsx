import { MessageCircle, ThumbsUp } from 'lucide-react';
import type { Post } from '../api/client.js';

type PostCardProps = {
  post: Post;
  index: number;
  onClick: () => void;
};

export function PostCard({ post, index, onClick }: PostCardProps) {
  const tags = post.tags?.map((item) => item.tag?.name ?? item.name).filter(Boolean).slice(0, 2) ?? [];
  const thumbClass = index % 3 === 1 ? 'parking' : index % 3 === 2 ? 'market' : 'pharmacy';
  const showThumb = index % 3 !== 0;

  return (
    <article className={`post-card ${showThumb ? 'has-thumb' : ''}`} onClick={onClick}>
      <div className="post-main">
        <div className="badges">
          <span>{post.category?.name ?? '일반'}</span>
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <h2>{post.title}</h2>
        <p>{post.content}</p>
        <footer>
          <span>
            {post.region?.name ?? '오산'} · {post.author?.nickname ?? '이웃'} · 조회 {post.viewCount ?? 0}
          </span>
          <span className="metrics">
            <ThumbsUp size={14} /> {post.likeCount ?? 0}
            <MessageCircle size={14} /> {post.commentCount ?? 0}
          </span>
        </footer>
      </div>
      {showThumb && <div className={`thumb ${thumbClass}`} aria-hidden="true" />}
    </article>
  );
}
