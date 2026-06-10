import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, fallbackCategories, fallbackPosts, type Category, type Post } from '../api/client.js';
import { PostCard } from '../components/PostCard.js';

type HomePageProps = {
  onOpenPost: (post: Post) => void;
  onAskAi: () => void;
};

export function HomePage({ onOpenPost, onAskAi }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>(fallbackPosts);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);

  useEffect(() => {
    void Promise.all([api.posts(), api.categories()])
      .then(([postResponse, categoryResponse]) => {
        if (postResponse.items.length > 0) {
          setPosts(postResponse.items);
        }
        setCategories(categoryResponse);
      })
      .catch(() => {
        setPosts(fallbackPosts);
        setCategories(fallbackCategories);
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

      <section className="quick-grid" aria-label="빠른 카테고리">
        {categories.slice(0, 6).map((category) => (
          <button type="button" key={category.id}>
            {category.name.replace(' 추천', '')}
          </button>
        ))}
      </section>

      <section className="feed" aria-label="게시글 목록">
        {posts.map((post, index) => (
          <PostCard post={post} index={index} key={post.id} onClick={() => onOpenPost(post)} />
        ))}
      </section>
    </div>
  );
}
