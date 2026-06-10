import { Bot, CheckCircle2, SearchCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api, fallbackCategories, isAuthError, type Category } from '../api/client.js';

type PostEditorPageProps = {
  isAuthed: boolean;
  onDone: () => void;
  onLogin: () => void;
};

export function PostEditorPage({ isAuthed, onDone, onLogin }: PostEditorPageProps) {
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [categoryId, setCategoryId] = useState(fallbackCategories[0].id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('오산, 생활정보');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api
      .categories()
      .then((items) => {
        setCategories(items);
        setCategoryId(items[0]?.id ?? fallbackCategories[0].id);
      })
      .catch(() => setCategories(fallbackCategories));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthed) {
      onLogin();
      return;
    }
    try {
      await api.createPost({
        title,
        content,
        categoryId,
        tagNames: tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      });
      onDone();
    } catch (error) {
      if (isAuthError(error)) {
        onLogin();
        return;
      }
      setMessage(error instanceof Error ? error.message : '게시글 저장에 실패했습니다.');
    }
  }

  async function suggestTags() {
    if (!isAuthed) {
      onLogin();
      return;
    }
    try {
      const result = await api.agent('tag-suggestion', `${title}\n${content}`);
      setTags(result.tags?.join(', ') ?? tags);
      setMessage('AI 태그 추천을 반영했습니다.');
    } catch (error) {
      if (isAuthError(error)) {
        onLogin();
        return;
      }
      setMessage(error instanceof Error ? error.message : 'AI 태그 추천을 사용할 수 없습니다.');
    }
  }

  async function duplicateCheck() {
    if (!isAuthed) {
      onLogin();
      return;
    }
    try {
      const result = await api.agent('duplicate-check', `${title}\n${content}`);
      setMessage(result.answer);
    } catch (error) {
      if (isAuthError(error)) {
        onLogin();
        return;
      }
      setMessage(error instanceof Error ? error.message : '중복 확인을 사용할 수 없습니다.');
    }
  }

  return (
    <form className="editor-page" onSubmit={submit}>
      <h1>오산에 글쓰기</h1>
      <label>
        제목
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 오산역 근처 야간 약국 공유해요" />
      </label>
      <label>
        카테고리
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        내용
        <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="오산 주민에게 공유할 내용을 적어주세요." />
      </label>
      <label>
        태그
        <input value={tags} onChange={(event) => setTags(event.target.value)} />
      </label>
      <div className="editor-tools">
        <button type="button" onClick={suggestTags}>
          <Bot size={18} /> 태그 추천
        </button>
        <button type="button" onClick={duplicateCheck}>
          <SearchCheck size={18} /> 중복 확인
        </button>
      </div>
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button" type="submit">
        <CheckCircle2 size={18} /> 등록
      </button>
    </form>
  );
}
