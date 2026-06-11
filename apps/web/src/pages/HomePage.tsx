import { Bot } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, fallbackPosts, type Post } from '../api/client.js';
import { emptyFeedMessage, selectBoardPosts, type BoardFeedState } from '../board/boardFilters.js';
import { PostCard } from '../components/PostCard.js';

type HomePageProps = {
  onOpenPost: (post: Post) => void;
  onAskAi: () => void;
  boardState: BoardFeedState;
};

export function HomePage({ onOpenPost, onAskAi, boardState }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>(fallbackPosts);
  const visiblePosts = useMemo(() => selectBoardPosts(posts, boardState), [posts, boardState]);

  useEffect(() => {
    void api
      .posts()
      .then((postResponse) => {
        if (postResponse.items.length > 0) {
          setPosts(postResponse.items);
        }
      })
      .catch(() => {
        setPosts(fallbackPosts);
      });
  }, []);

  return (
    <div className="home-page">
      <section className="ai-card">
        <div>
          <p>AI 동네 도우미</p>
          <strong>“이번 주말 플리마켓 열어도 될까?”</strong>
          <span>오산 날씨와 최근 행사 글을 함께 확인합니다.</span>
        </div>
        <button type="button" onClick={onAskAi} aria-label="AI에게 질문">
          <Bot size={18} />
          질문
        </button>
      </section>

      <section className="feed" aria-label="게시글 목록">
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
      </section>
    </div>
  );
}
