import { ArrowLeft, MessageCircle, ThumbsUp } from 'lucide-react';
import type { Post } from '../api/client.js';

type PostDetailPageProps = {
  post: Post | null;
  onBack: () => void;
};

export function PostDetailPage({ post, onBack }: PostDetailPageProps) {
  if (!post) {
    return (
      <section className="empty-state">
        <p>게시글을 선택해 주세요.</p>
        <button type="button" onClick={onBack}>
          목록으로
        </button>
      </section>
    );
  }

  return (
    <article className="detail-page">
      <button className="icon-text-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        목록
      </button>
      <div className="detail-meta">
        <span>{post.category?.name ?? '일반'}</span>
        <span>{post.region?.name ?? '오산'}</span>
      </div>
      <h1>{post.title}</h1>
      <p className="detail-author">{post.author?.nickname ?? '이웃'} · 조회 {post.viewCount ?? 0}</p>
      <p className="detail-content">{post.content}</p>
      <div className="detail-actions">
        <button type="button">
          <ThumbsUp size={18} /> 좋아요 {post.likeCount ?? 0}
        </button>
        <button type="button">
          <MessageCircle size={18} /> 댓글 {post.commentCount ?? 0}
        </button>
      </div>
    </article>
  );
}
