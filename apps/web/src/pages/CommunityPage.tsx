import { MessageCircleMore } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, fallbackPosts, type Post } from '../api/client.js';
import { PostCard } from '../components/PostCard.js';

type CommunityPageProps = {
  onOpenPost: (post: Post) => void;
};

export function CommunityPage({ onOpenPost }: CommunityPageProps) {
  const [posts, setPosts] = useState<Post[]>(fallbackPosts);

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
        <span>전체 {posts.length}</span>
        <span>오산 중심</span>
        <span>최신순</span>
      </div>

      <div className="feed community-feed" aria-label="커뮤니티 게시글 목록">
        {posts.map((post, index) => (
          <PostCard post={post} index={index} key={post.id} onClick={() => onOpenPost(post)} />
        ))}
      </div>
    </section>
  );
}
