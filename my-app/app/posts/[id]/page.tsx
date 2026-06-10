"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface Post {
  id: number;
  title: string;
  content: string;
}

interface Comment {
  id: number;
  content: string;
  author: string;
  created_at: string;
}

export default function PostPage() {
  const { id } = useParams();
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/posts/${id}`).then(async (res) => {
      if (!res.ok) {
        alert("게시글을 찾을 수 없습니다.");
        router.replace("/");
        return;
      }
      setPost(await res.json());
    });

    fetchComments();
  }, [id]);

  async function fetchComments() {
    const data = await fetch(`/api/posts/${id}/comments`).then((res) =>
      res.json()
    );
    setComments(data);
  }

  async function handleCommentSubmit() {
    setError("");
    const res = await fetch(`/api/posts/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment }),
    });

    if (res.status === 401) {
      setError("댓글을 작성하려면 로그인이 필요합니다.");
      return;
    }
    if (res.status === 404) {
      setError("게시글이 존재하지 않습니다.");
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "오류가 발생했습니다.");
      return;
    }

    setNewComment("");
    fetchComments();
  }

  if (!post) return <div className="max-w-xl mx-auto p-8">불러오는 중...</div>;

  return (
    <main className="max-w-xl mx-auto p-8">
      <button
        className="text-sm text-gray-500 mb-4 hover:underline"
        onClick={() => router.back()}
      >
        ← 목록으로
      </button>

      <div className="border p-4 rounded mb-8">
        <h1 className="text-2xl font-bold mb-2">{post.title}</h1>
        <p className="text-gray-700">{post.content}</p>
      </div>

      <h2 className="text-lg font-bold mb-4">댓글 {comments.length}개</h2>

      <ul className="flex flex-col gap-3 mb-6">
        {comments.length === 0 && (
          <li className="text-gray-400 text-sm">첫 번째 댓글을 남겨보세요.</li>
        )}
        {comments.map((comment) => (
          <li key={comment.id} className="border p-3 rounded">
            <p className="text-sm text-gray-500 mb-1">{comment.author}</p>
            <p>{comment.content}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <textarea
          className="border p-2 rounded"
          placeholder="댓글을 입력하세요"
          rows={3}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          className="bg-black text-white p-2 rounded"
          onClick={handleCommentSubmit}
        >
          댓글 작성
        </button>
      </div>
    </main>
  );
}
