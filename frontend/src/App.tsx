import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LogIn,
  LogOut,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import {
  AuthResponse,
  BriefingPreview,
  Comment,
  Post,
  PostList,
  User,
  YoutubeSource,
  YoutubeVideo,
  api,
} from './api'

type AuthMode = 'login' | 'signup'
type Panel = 'board' | 'rag' | 'youtube' | 'briefing'

function useStoredToken() {
  const [token, setToken] = useState(() => localStorage.getItem('caesar_token'))
  const saveToken = (next: string | null) => {
    if (next) localStorage.setItem('caesar_token', next)
    else localStorage.removeItem('caesar_token')
    setToken(next)
  }
  return [token, saveToken] as const
}

export default function App() {
  const queryClient = useQueryClient()
  const [token, setToken] = useStoredToken()
  const [panel, setPanel] = useState<Panel>('board')
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<User>('/auth/me', {}, token),
    enabled: Boolean(token),
    retry: false,
  })

  const posts = useQuery({
    queryKey: ['posts', search],
    queryFn: () =>
      api<PostList>(`/posts?page=1&page_size=30${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  })

  const selectedPost = useMemo(
    () => posts.data?.items.find((post) => post.id === selectedPostId) ?? posts.data?.items[0] ?? null,
    [posts.data?.items, selectedPostId],
  )

  const logout = () => {
    setToken(null)
    void queryClient.invalidateQueries()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">RESCENE</p>
          <h1>Fan Board</h1>
        </div>
        <div className="session">
          {me.data ? (
            <>
              <span>{me.data.display_name}</span>
              {me.data.role === 'admin' && <span className="role">admin</span>}
              <button className="iconButton" onClick={logout} title="로그아웃">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <span className="muted">guest</span>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button className={panel === 'board' ? 'active' : ''} onClick={() => setPanel('board')}>
          Board
        </button>
        <button className={panel === 'rag' ? 'active' : ''} onClick={() => setPanel('rag')}>
          RAG
        </button>
        <button className={panel === 'youtube' ? 'active' : ''} onClick={() => setPanel('youtube')}>
          YouTube
        </button>
        <button className={panel === 'briefing' ? 'active' : ''} onClick={() => setPanel('briefing')}>
          Briefing
        </button>
      </nav>

      <main className="layout">
        <section className="leftPane">
          <div className="searchbar">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="검색" />
          </div>
          <PostListView
            posts={posts.data?.items ?? []}
            loading={posts.isLoading}
            selectedId={selectedPost?.id ?? null}
            onSelect={setSelectedPostId}
          />
        </section>

        <section className="mainPane">
          {!me.data && <AuthPanel setToken={setToken} />}
          {panel === 'board' && (
            <BoardPanel
              token={token}
              user={me.data}
              post={selectedPost}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ['posts'] })
                void queryClient.invalidateQueries({ queryKey: ['comments', selectedPost?.id] })
              }}
            />
          )}
          {panel === 'rag' && <RagPanel token={token} selectedPost={selectedPost} />}
          {panel === 'youtube' && <YoutubePanel token={token} user={me.data} />}
          {panel === 'briefing' && <BriefingPanel token={token} user={me.data} />}
        </section>
      </main>
    </div>
  )
}

function AuthPanel({ setToken }: { setToken: (token: string | null) => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      api<AuthResponse>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'signup' ? { email, password, display_name: displayName } : { email, password },
        ),
      }),
    onSuccess: (data) => setToken(data.access_token),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  return (
    <form className="authPanel" onSubmit={submit}>
      <div className="segmented">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Login
        </button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
          Sign up
        </button>
      </div>
      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="password"
        type="password"
      />
      {mode === 'signup' && (
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="display name"
        />
      )}
      <button className="primary" type="submit" disabled={mutation.isPending} title={mode}>
        <LogIn size={17} />
        {mode === 'signup' ? 'Create account' : 'Login'}
      </button>
      {mutation.error && <p className="error">{mutation.error.message}</p>}
    </form>
  )
}

function PostListView({
  posts,
  loading,
  selectedId,
  onSelect,
}: {
  posts: Post[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  if (loading) return <p className="muted">Loading...</p>
  return (
    <div className="postList">
      {posts.map((post) => (
        <button
          key={post.id}
          className={post.id === selectedId ? 'postRow selected' : 'postRow'}
          onClick={() => onSelect(post.id)}
        >
          <span>{post.title}</span>
          <small>
            {post.author.display_name} · {post.comment_count}
          </small>
        </button>
      ))}
    </div>
  )
}

function BoardPanel({
  token,
  user,
  post,
  onChanged,
}: {
  token: string | null
  user?: User
  post: Post | null
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const comments = useQuery({
    queryKey: ['comments', post?.id],
    queryFn: () => api<Comment[]>(`/posts/${post?.id}/comments`),
    enabled: Boolean(post?.id),
  })
  const createPost = useMutation({
    mutationFn: () =>
      api<Post>(
        '/posts',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            content,
            artist_id: 1,
            tags: tags.split(',').map((tag) => tag.trim()),
          }),
        },
        token,
      ),
    onSuccess: () => {
      setTitle('')
      setContent('')
      setTags('')
      onChanged()
    },
  })
  const [comment, setComment] = useState('')
  const createComment = useMutation({
    mutationFn: () =>
      api<Comment>(
        `/posts/${post?.id}/comments`,
        { method: 'POST', body: JSON.stringify({ content: comment }) },
        token,
      ),
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['comments', post?.id] })
      onChanged()
    },
  })

  return (
    <div className="stack">
      {user && (
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            createPost.mutate()
          }}
        >
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="내용" />
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag, tag" />
          <button className="primary" disabled={createPost.isPending} title="글 작성">
            <MessageSquarePlus size={17} />
            Post
          </button>
          {createPost.error && <p className="error">{createPost.error.message}</p>}
        </form>
      )}

      {post && (
        <article className="postDetail">
          <div className="postHead">
            <h2>{post.title}</h2>
            <span>{post.author.display_name}</span>
          </div>
          <p>{post.content}</p>
          <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="comments">
            {comments.data?.map((item) => (
              <p key={item.id}>
                <b>{item.author.display_name}</b> {item.content}
              </p>
            ))}
          </div>
          {user && (
            <form
              className="inlineForm"
              onSubmit={(event) => {
                event.preventDefault()
                createComment.mutate()
              }}
            >
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="댓글" />
              <button className="iconButton" title="댓글 작성">
                <Send size={17} />
              </button>
            </form>
          )}
        </article>
      )}
    </div>
  )
}

function RagPanel({ token, selectedPost }: { token: string | null; selectedPost: Post | null }) {
  const [question, setQuestion] = useState('')
  const qa = useMutation({
    mutationFn: () =>
      api<{ answer: string; sources: Array<{ content: string }> }>(
        '/ai/qa',
        { method: 'POST', body: JSON.stringify({ question, artist_id: 1 }) },
        token,
      ),
  })
  const similar = useMutation({
    mutationFn: () =>
      api<Post[]>('/ai/similar', { method: 'POST', body: JSON.stringify({ post_id: selectedPost?.id }) }, token),
  })
  return (
    <div className="stack">
      <form
        className="qaBox"
        onSubmit={(event) => {
          event.preventDefault()
          qa.mutate()
        }}
      >
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="질문" />
        <button className="primary" disabled={!token || qa.isPending} title="질문 보내기">
          <Send size={17} />
          Ask
        </button>
      </form>
      {qa.error && <p className="error">{qa.error.message}</p>}
      {qa.data && (
        <section className="answer">
          <h2>Answer</h2>
          <p>{qa.data.answer}</p>
          {qa.data.sources.map((source, index) => (
            <blockquote key={`${source.content}-${index}`}>{source.content}</blockquote>
          ))}
        </section>
      )}
      <button className="secondary" disabled={!token || !selectedPost} onClick={() => similar.mutate()}>
        Similar posts
      </button>
      {similar.data?.map((post) => <p key={post.id}>{post.title}</p>)}
    </div>
  )
}

function YoutubePanel({ token, user }: { token: string | null; user?: User }) {
  const queryClient = useQueryClient()
  const videos = useQuery({
    queryKey: ['videos', 1],
    queryFn: () => api<YoutubeVideo[]>('/artists/1/videos'),
  })
  const sources = useQuery({
    queryKey: ['sources', 1],
    queryFn: () => api<YoutubeSource[]>('/artists/1/youtube-sources'),
  })
  const [sourceValue, setSourceValue] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceType, setSourceType] = useState('official_channel')
  const addSource = useMutation({
    mutationFn: () =>
      api<YoutubeSource>(
        '/artists/1/youtube-sources',
        {
          method: 'POST',
          body: JSON.stringify({ source_type: sourceType, source_value: sourceValue, title: sourceTitle }),
        },
        token,
      ),
    onSuccess: () => {
      setSourceValue('')
      setSourceTitle('')
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
    },
  })
  const sync = useMutation({
    mutationFn: () => api<{ created: number; updated: number; linked: number }>('/artists/1/sync', { method: 'POST' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['videos', 1] })
    },
  })
  return (
    <div className="stack">
      {user?.role === 'admin' && (
        <form
          className="sourceForm"
          onSubmit={(event) => {
            event.preventDefault()
            addSource.mutate()
          }}
        >
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="official_channel">official_channel</option>
            <option value="fan_channel">fan_channel</option>
            <option value="curated_video">curated_video</option>
          </select>
          <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="title" />
          <input value={sourceValue} onChange={(event) => setSourceValue(event.target.value)} placeholder="channel or video id" />
          <button className="secondary" title="소스 추가">
            <Upload size={17} />
            Add
          </button>
          <button type="button" className="primary" onClick={() => sync.mutate()} disabled={sync.isPending} title="동기화">
            <RefreshCw size={17} />
            Sync
          </button>
        </form>
      )}
      {sync.error && <p className="error">{sync.error.message}</p>}
      <div className="sourceList">
        {sources.data?.map((source) => (
          <span key={source.id}>{source.title}</span>
        ))}
      </div>
      <div className="videoGrid">
        {videos.data?.map((video) => (
          <a key={video.id} className="videoItem" href={video.url} target="_blank" rel="noreferrer">
            <span>{video.title}</span>
            <small>{video.channel_title}</small>
          </a>
        ))}
      </div>
    </div>
  )
}

function BriefingPanel({ token, user }: { token: string | null; user?: User }) {
  const [preview, setPreview] = useState<BriefingPreview | null>(null)
  const previewMutation = useMutation({
    mutationFn: (refresh: boolean) =>
      api<BriefingPreview>(`/ai/briefing/preview?refresh=${refresh}`, { method: 'POST' }, token),
    onSuccess: setPreview,
  })
  const publish = useMutation({
    mutationFn: () => api<Post>(`/ai/briefing/${preview?.run_id}/publish`, { method: 'POST' }, token),
  })
  if (user?.role !== 'admin') {
    return (
      <div className="emptyState">
        <ShieldCheck size={24} />
        <p>Published briefings appear in the board.</p>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <button className="secondary" onClick={() => previewMutation.mutate(false)} disabled={previewMutation.isPending}>
          Preview
        </button>
        <button className="secondary" onClick={() => previewMutation.mutate(true)} disabled={previewMutation.isPending}>
          Refresh preview
        </button>
        <button className="primary" onClick={() => publish.mutate()} disabled={!preview || publish.isPending}>
          Publish
        </button>
      </div>
      {previewMutation.error && <p className="error">{previewMutation.error.message}</p>}
      {publish.error && <p className="error">{publish.error.message}</p>}
      {publish.data && <p className="success">Published: {publish.data.title}</p>}
      {preview && <pre className="preview">{preview.preview_markdown}</pre>}
    </div>
  )
}
