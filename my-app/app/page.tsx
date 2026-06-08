"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => setPosts(data));
  }, []);

  async function handleSubmit() {
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setTitle("");
    setContent("");
    const data = await fetch("/api/posts").then((res) => res.json());
    setPosts(data);
  }

  return (
    <main className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">글 목록</h1>

      <div className="mb-8 flex flex-col gap-2">
        <input
          className="border p-2 rounded"
          placeholder="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="border p-2 rounded"
          placeholder="내용"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          className="bg-black text-white p-2 rounded"
          onClick={handleSubmit}
        >
          저장
        </button>
      </div>

      <ul className="flex flex-col gap-4">
        {posts.map((post: any) => (
          <li key={post.id} className="border p-4 rounded">
            <h2 className="font-bold">{post.title}</h2>
            <p>{post.content}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}