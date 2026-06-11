import { MessageCircleMore } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, fallbackPosts, type Post } from '../api/client.js';
import {
  boardFilterLabel,
  emptyFeedMessage,
  selectBoardPosts,
  type BoardFeedState
} from '../board/boardFilters.js';
import { PostCard } from '../components/PostCard.js';

type CommunityPageProps = {
  onOpenPost: (post: Post) => void;
  boardState: BoardFeedState;
};

export function CommunityPage({ onOpenPost, boardState }: CommunityPageProps) {
  const [posts, setPosts] = useState<Post[]>(fallbackPosts);
  const visiblePosts = useMemo(() => selectBoardPosts(posts, boardState), [posts, boardState]);

  useEffect(() => {
    void api
      .posts()
      .then((response) => {
        if (response.items.length > 0) {
          setPosts(response.items);
        }
      })
      .catch(() => {
        setPosts(fallbackPosts);
      });
  }, []);

  return (
    <section className="community-page" aria-label="커뮤니티 게시글">
      <div className="page-heading community-heading">
        <MessageCircleMore size={24} />
        <div>
          <h1>오산 커뮤니티</h1>
          <p>동네 소식과 생활 정보를 모아봅니다.</p>
        </div>
      </div>

      <div className="community-stats" aria-label="커뮤니티 요약">
        <span>{boardState.searchQuery?.trim() ? `검색: ${boardState.searchQuery.trim()}` : boardState.category}</span>
        <span>{boardFilterLabel(boardState.filter)}</span>
        <span>{visiblePosts.length}개</span>
      </div>

      <div className="feed community-feed" aria-label="커뮤니티 게시글 목록">
        {visiblePosts.length > 0 ? (
          visiblePosts.map((post, index) => (
            <PostCard post={post} index={index} key={post.id} onClick={() => onOpenPost(post)} />
          ))
        ) : (
          <div className="empty-state feed-empty">
            <strong>게시글이 없습니다.</strong>
            <span>{emptyFeedMessage(boardState)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
