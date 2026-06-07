import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  LogIn,
  LogOut,
  MessageSquarePlus,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArtistKeyword,
  AuthResponse,
  BriefingPreview,
  Comment,
  InfraCostSettings,
  Member,
  Post,
  PostList,
  QaSource,
  SignupSettings,
  Tag,
  UpdateFeedItem,
  UpdateFeedResponse,
  User,
  YoutubeSource,
  YoutubeVideo,
  api,
} from './api'

type AuthMode = 'login' | 'signup'
type Panel = 'home' | 'board' | 'rag' | 'youtube' | 'briefing' | 'admin'
type VideoSort = 'latest' | 'views' | 'title'
type FeedSource = 'all' | 'youtube' | 'naver' | 'briefing' | 'post'

function useStoredToken() {
  const [token, setToken] = useState(() => localStorage.getItem('caesar_token'))
  const saveToken = (next: string | null) => {
    if (next) localStorage.setItem('caesar_token', next)
    else localStorage.removeItem('caesar_token')
    setToken(next)
  }
  return [token, saveToken] as const
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-"
  return new Intl.NumberFormat('en-US').format(value)
}

function excerpt(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

const memberLabels: Record<string, string> = {
  Woni: '원이',
  Liv: '리브',
  Minami: '미나미',
  May: '메이',
  Zena: '제나',
}

function memberLabel(name: string) {
  return memberLabels[name] ?? name
}

function postIdFromUrl(url: string) {
  const match = url.match(/^\/posts\/(\d+)$/)
  return match ? Number(match[1]) : null
}

export default function App() {
  const queryClient = useQueryClient()
  const [token, setToken] = useStoredToken()
  const [panel, setPanel] = useState<Panel>('home')
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [page, setPage] = useState(1)

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<User>('/auth/me', {}, token),
    enabled: Boolean(token),
    retry: false,
  })

  const posts = useQuery({
    queryKey: ['posts', search, tagFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: '10' })
      if (search) params.set('search', search)
      if (tagFilter) params.set('tag', tagFilter)
      return api<PostList>(`/posts?${params.toString()}`)
    },
  })
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => api<Tag[]>('/tags'),
  })
  const signupStatus = useQuery({
    queryKey: ['signup-status'],
    queryFn: () => api<SignupSettings>('/auth/signup-status'),
  })
  const adminSignupSettings = useQuery({
    queryKey: ['admin-signup-settings', token],
    queryFn: () => api<SignupSettings>('/admin/settings/signup', {}, token),
    enabled: Boolean(token && me.data?.role === 'admin'),
  })
  const signupEnabled =
    adminSignupSettings.data?.public_signup_enabled ?? signupStatus.data?.public_signup_enabled ?? false
  const updateSignupSettings = useMutation({
    mutationFn: (enabled: boolean) =>
      api<SignupSettings>(
        '/admin/settings/signup',
        {
          method: 'PUT',
          body: JSON.stringify({ public_signup_enabled: enabled }),
        },
        token,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['signup-status'], data)
      queryClient.setQueryData(['admin-signup-settings', token], data)
    },
  })

  const listedSelectedPost = useMemo(
    () => posts.data?.items.find((post) => post.id === selectedPostId) ?? null,
    [posts.data?.items, selectedPostId],
  )
  const selectedPostById = useQuery({
    queryKey: ['post', selectedPostId],
    queryFn: () => api<Post>(`/posts/${selectedPostId}`),
    enabled: Boolean(selectedPostId && !listedSelectedPost),
  })
  const selectedPost = listedSelectedPost ?? selectedPostById.data ?? posts.data?.items[0] ?? null

  const logout = () => {
    setToken(null)
    void queryClient.invalidateQueries()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">RESCENE</p>
          <h1>Updates</h1>
        </div>
        <div className="session">
          {me.data ? (
            <>
              <span>{me.data.display_name}</span>
              {me.data.role === 'admin' && <span className="role">admin</span>}
              {me.data.role === 'admin' && (
                <label className="signupToggle" title="회원가입 허용">
                  <input
                    type="checkbox"
                    checked={signupEnabled}
                    disabled={updateSignupSettings.isPending || adminSignupSettings.isLoading}
                    onChange={(event) => updateSignupSettings.mutate(event.target.checked)}
                  />
                  <span>
                    <UserPlus size={15} />
                    Signup
                  </span>
                </label>
              )}
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
        <button className={panel === 'home' ? 'active' : ''} onClick={() => setPanel('home')}>
          홈
        </button>
        <button className={panel === 'board' ? 'active' : ''} onClick={() => setPanel('board')}>
          팬 게시판
        </button>
        <button className={panel === 'rag' ? 'active' : ''} onClick={() => setPanel('rag')}>
          아카이브
        </button>
        <button className={panel === 'youtube' ? 'active' : ''} onClick={() => setPanel('youtube')}>
          YouTube
        </button>
        <button className={panel === 'briefing' ? 'active' : ''} onClick={() => setPanel('briefing')}>
          오늘의 요약
        </button>
        {me.data?.role === 'admin' && (
          <button className={panel === 'admin' ? 'active' : ''} onClick={() => setPanel('admin')}>
            관리
          </button>
        )}
      </nav>

      <main className={panel === 'home' ? 'layout homeLayout' : 'layout'}>
        <section className="leftPane">
          <div className="sideTitle">
            <strong>팬 게시판</strong>
            <span>후기와 댓글</span>
          </div>
          <div className="searchbar">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="검색"
            />
          </div>
          <select
            className="filterSelect"
            value={tagFilter}
            onChange={(event) => {
              setTagFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All tags</option>
            {tags.data?.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
          <PostListView
            posts={posts.data?.items ?? []}
            loading={posts.isLoading}
            selectedId={selectedPost?.id ?? null}
            onSelect={setSelectedPostId}
            total={posts.data?.total ?? 0}
            page={page}
            pageSize={posts.data?.page_size ?? 10}
            onPageChange={setPage}
          />
        </section>

        <section className="mainPane">
          {!me.data && panel !== 'home' && (
            <AuthPanel
              publicSignupEnabled={signupStatus.data?.public_signup_enabled ?? false}
              setToken={setToken}
            />
          )}
          {panel === 'home' && (
            <HomePanel
              token={token}
              user={me.data}
              onOpenPost={(postId) => {
                setSelectedPostId(postId)
                setPanel('board')
              }}
            />
          )}
          {!me.data && panel === 'home' && (
            <AuthPanel
              publicSignupEnabled={signupStatus.data?.public_signup_enabled ?? false}
              setToken={setToken}
            />
          )}
          {panel === 'board' && (
            <BoardPanel
              token={token}
              user={me.data}
              post={selectedPost}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ['posts'] })
                void queryClient.invalidateQueries({ queryKey: ['post', selectedPost?.id] })
                void queryClient.invalidateQueries({ queryKey: ['updates'] })
                void queryClient.invalidateQueries({ queryKey: ['comments', selectedPost?.id] })
                void queryClient.invalidateQueries({ queryKey: ['tags'] })
              }}
              onDeleted={() => setSelectedPostId(null)}
            />
          )}
          {panel === 'rag' && (
            <RagPanel
              token={token}
              selectedPost={selectedPost}
              onOpenPost={(postId) => {
                setSelectedPostId(postId)
                setPanel('board')
              }}
            />
          )}
          {panel === 'youtube' && <YoutubePanel token={token} user={me.data} />}
          {panel === 'briefing' && <BriefingPanel token={token} user={me.data} />}
          {panel === 'admin' && <AdminPanel token={token} user={me.data} />}
        </section>
      </main>
    </div>
  )
}

function HomePanel({
  token,
  user,
  onOpenPost,
}: {
  token: string | null
  user?: User
  onOpenPost: (postId: number) => void
}) {
  const [source, setSource] = useState<FeedSource>('all')
  const [member, setMember] = useState('')
  const [keyword, setKeyword] = useState('')
  const [feedQuery, setFeedQuery] = useState('')
  const [archiveQuestion, setArchiveQuestion] = useState('최근 원이 영상 뭐 있어?')
  const updates = useQuery({
    queryKey: ['updates', source, member, keyword, feedQuery],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '30' })
      if (source !== 'all') params.set('source', source)
      if (member) params.set('member', member)
      if (keyword) params.set('keyword', keyword)
      if (feedQuery) params.set('q', feedQuery)
      return api<UpdateFeedResponse>(`/artists/1/updates?${params.toString()}`)
    },
  })
  const members = useQuery({
    queryKey: ['members', 1],
    queryFn: () => api<Member[]>('/artists/1/members'),
  })
  const artistKeywords = useQuery({
    queryKey: ['artist-keywords', 1],
    queryFn: () => api<ArtistKeyword[]>('/artists/1/keywords'),
  })
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => api<Tag[]>('/tags'),
  })
  const qa = useMutation({
    mutationFn: () =>
      api<{ answer: string; sources: QaSource[] }>(
        '/ai/qa',
        { method: 'POST', body: JSON.stringify({ question: archiveQuestion, artist_id: 1 }) },
        token,
      ),
  })
  const keywordOptions = useMemo(() => {
    const fixed = ['컴백', '무대', '직캠', '라디오', 'Love Attack']
    const fromArtist = artistKeywords.data?.map((item) => item.keyword) ?? []
    const fromTags = tags.data?.map((item) => item.name) ?? []
    return [...new Set([...fixed, ...fromArtist, ...fromTags])].slice(0, 14)
  }, [artistKeywords.data, tags.data])
  const sourceOptions: { value: FeedSource; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'naver', label: 'Naver' },
    { value: 'briefing', label: '오늘의 요약' },
    { value: 'post', label: '팬글' },
  ]
  const examples = ['최근 원이 영상 뭐 있어?', '러브어택 무대 영상 모아줘', '이번 주 리센느 소식 요약해줘']
  return (
    <div className="homeStack">
      <section className="homeHero">
        <div className="homeIntro">
          <p className="eyebrow">오늘/최근 업데이트</p>
          <h2>리센느 떡밥 모아보기</h2>
          <p className="muted">YouTube, Naver, 브리핑, 팬 게시글을 시간순으로 모아 봅니다.</p>
        </div>
        <form
          className="archiveSearch"
          onSubmit={(event) => {
            event.preventDefault()
            qa.mutate()
          }}
        >
          <label htmlFor="archive-question">아카이브 검색</label>
          <div className="archiveInput">
            <Search size={18} />
            <input
              id="archive-question"
              value={archiveQuestion}
              onChange={(event) => setArchiveQuestion(event.target.value)}
              placeholder="예: 러브어택 무대 영상 모아줘"
            />
            <button className="primary" disabled={!token || qa.isPending} title="아카이브 검색">
              <Send size={17} />
              검색
            </button>
          </div>
          <div className="exampleChips">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                className={archiveQuestion === example ? 'active' : ''}
                onClick={() => setArchiveQuestion(example)}
              >
                {example}
              </button>
            ))}
          </div>
          {!token && <p className="hint">읽기는 공개입니다. AI 아카이브 검색은 로그인 후 사용할 수 있습니다.</p>}
          {qa.error && <p className="error">{qa.error.message}</p>}
        </form>
      </section>

      {qa.data && (
        <section className="archiveResult">
          <div className="sectionHead">
            <div>
              <p className="eyebrow">Archive answer</p>
              <h2>검색 결과</h2>
            </div>
          </div>
          <p>{qa.data.answer}</p>
          <div className="sourceCards">
            {qa.data.sources.map((qaSource, index) => (
              <SourceCard
                key={`${qaSource.source_type}-${qaSource.chunk_id}-${index}`}
                source={qaSource}
                onOpenPost={onOpenPost}
              />
            ))}
          </div>
        </section>
      )}

      <section className="feedPanel">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">Live feed</p>
            <h2>통합 업데이트</h2>
          </div>
          <span className="feedCount">{formatNumber(updates.data?.items.length ?? 0)} items</span>
        </div>
        <div className="feedControls">
          <div className="searchbar">
            <Search size={17} />
            <input
              value={feedQuery}
              onChange={(event) => setFeedQuery(event.target.value)}
              placeholder="제목, 출처, 키워드 검색"
            />
          </div>
          <div className="filterLine" aria-label="source filter">
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={source === option.value ? 'active' : ''}
                onClick={() => setSource(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="chipLine" aria-label="member filter">
            <button type="button" className={!member ? 'active' : ''} onClick={() => setMember('')}>
              멤버 전체
            </button>
            {members.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                className={member === item.name ? 'active' : ''}
                onClick={() => setMember(item.name)}
              >
                {memberLabel(item.name)}
              </button>
            ))}
          </div>
          <div className="chipLine" aria-label="keyword filter">
            <button type="button" className={!keyword ? 'active' : ''} onClick={() => setKeyword('')}>
              키워드 전체
            </button>
            {keywordOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={keyword === item ? 'active' : ''}
                onClick={() => setKeyword(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        {updates.data?.naver_available === false && (
          <p className="hint">Naver 키 또는 호출이 잠시 unavailable입니다. YouTube/게시글/브리핑은 계속 표시됩니다.</p>
        )}
        {updates.isLoading && <p className="muted">업데이트를 불러오는 중...</p>}
        {updates.error && <p className="error">{updates.error.message}</p>}
        <div className="feedList">
          {updates.data?.items.map((item) => (
            <UpdateFeedCard key={item.id} item={item} onOpenPost={onOpenPost} />
          ))}
        </div>
        {!updates.isLoading && updates.data?.items.length === 0 && (
          <div className="emptyState">
            <FileText size={24} />
            <p>조건에 맞는 업데이트가 없습니다.</p>
          </div>
        )}
      </section>

      {user?.role === 'admin' && (
        <p className="adminHint">동기화와 오늘의 요약 발행은 상단 YouTube/오늘의 요약 탭에서 관리합니다.</p>
      )}
    </div>
  )
}

function UpdateFeedCard({ item, onOpenPost }: { item: UpdateFeedItem; onOpenPost: (postId: number) => void }) {
  const postId = postIdFromUrl(item.url)
  const isExternal = item.url.startsWith('http')
  const label =
    item.item_type === 'youtube'
      ? 'YouTube'
      : item.item_type === 'briefing'
        ? '오늘의 요약'
        : item.item_type === 'post'
          ? '팬글'
          : item.item_type === 'naver_blog'
            ? 'Naver Blog'
            : 'Naver News'
  const body = (
    <>
      <div className="updateThumb">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" loading="lazy" />
        ) : item.item_type === 'youtube' ? (
          <PlayCircle size={26} />
        ) : (
          <FileText size={24} />
        )}
      </div>
      <div className="updateBody">
        <div className="updateMeta">
          <span className={`typeBadge ${item.item_type}`}>{label}</span>
          <span>{item.source_label}</span>
          <span>{formatDateTime(item.published_at)}</span>
        </div>
        <strong>{item.title}</strong>
        {item.description && <p>{excerpt(item.description, 130)}</p>}
        <div className="updateFoot">
          {item.view_count !== null && (
            <span>
              <Eye size={14} />
              {formatNumber(item.view_count)}
            </span>
          )}
          {item.comment_count !== null && <span>댓글 {formatNumber(item.comment_count)}</span>}
          {[...item.member_names.map(memberLabel), ...item.matched_keywords, ...item.tags].slice(0, 4).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
      </div>
      {isExternal && <ExternalLink className="sourceOpen" size={16} />}
    </>
  )
  if (isExternal) {
    return (
      <a className="updateCard" href={item.url} target="_blank" rel="noreferrer">
        {body}
      </a>
    )
  }
  return (
    <button
      type="button"
      className="updateCard"
      onClick={() => postId && onOpenPost(postId)}
      disabled={!postId}
    >
      {body}
    </button>
  )
}

function AuthPanel({
  publicSignupEnabled,
  setToken,
}: {
  publicSignupEnabled: boolean
  setToken: (token: string | null) => void
}) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  useEffect(() => {
    if (!publicSignupEnabled && mode === 'signup') setMode('login')
  }, [mode, publicSignupEnabled])
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
        {publicSignupEnabled && (
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        )}
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
  total,
  page,
  pageSize,
  onPageChange,
}: {
  posts: Post[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  if (loading) return <p className="muted">Loading...</p>
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <>
      <div className="boardTable">
        <div className="boardHeader">
          <span>제목</span>
          <span>작성자</span>
          <span>댓글</span>
          <span>날짜</span>
        </div>
        {posts.map((post) => (
          <button
            key={post.id}
            type="button"
            className={post.id === selectedId ? 'boardRow selected' : 'boardRow'}
            onClick={() => onSelect(post.id)}
          >
            <span className="boardTitleCell">
              <strong>{post.title}</strong>
              {post.tags.length > 0 && (
                <span className="miniTags">
                  {post.tags.slice(0, 2).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </span>
              )}
            </span>
            <span>{post.author.display_name}</span>
            <span>{post.comment_count}</span>
            <span>{formatDate(post.created_at)}</span>
          </button>
        ))}
      </div>
      <div className="pager">
        <button
          className="iconButton"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="이전 페이지"
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          className="iconButton"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="다음 페이지"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </>
  )
}

function BoardPanel({
  token,
  user,
  post,
  onChanged,
  onDeleted,
}: {
  token: string | null
  user?: User
  post: Post | null
  onChanged: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  useEffect(() => {
    setEditing(false)
    setEditTitle(post?.title ?? '')
    setEditContent(post?.content ?? '')
    setEditTags(post?.tags.join(', ') ?? '')
  }, [post?.id, post?.title, post?.content, post?.tags])

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
  const updatePost = useMutation({
    mutationFn: () =>
      api<Post>(
        `/posts/${post?.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: editTitle,
            content: editContent,
            tags: editTags.split(',').map((tag) => tag.trim()),
          }),
        },
        token,
      ),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const deletePost = useMutation({
    mutationFn: () => api<void>(`/posts/${post?.id}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      onDeleted()
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
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="태그, 태그" />
          <button className="primary" disabled={createPost.isPending} title="글 작성">
            <MessageSquarePlus size={17} />
            글쓰기
          </button>
          {createPost.error && <p className="error">{createPost.error.message}</p>}
        </form>
      )}

      {post && (
        <article className="postDetail">
          <div className="postHead">
            <div>
              <h2>{post.title}</h2>
              <div className="postMeta">
                <span>{post.author.display_name}</span>
                <span>{formatDate(post.created_at)}</span>
                <span>댓글 {post.comment_count}</span>
              </div>
            </div>
          </div>
          {(user?.id === post.author.id || user?.role === 'admin') && (
            <div className="toolbar">
              <button className="secondary" onClick={() => setEditing((value) => !value)} title="글 수정">
                <Edit3 size={17} />
                수정
              </button>
              <button
                className="danger"
                onClick={() => deletePost.mutate()}
                disabled={deletePost.isPending}
                title="글 삭제"
              >
                <Trash2 size={17} />
                삭제
              </button>
            </div>
          )}
          {editing ? (
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault()
                updatePost.mutate()
              }}
            >
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="제목" />
              <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} placeholder="내용" />
              <input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="태그, 태그" />
              <button className="primary" disabled={updatePost.isPending} title="수정 저장">
                <Save size={17} />
                저장
              </button>
            </form>
          ) : (
            <>
              <p className="postContent">{post.content}</p>
              <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </>
          )}
          {updatePost.error && <p className="error">{updatePost.error.message}</p>}
          {deletePost.error && <p className="error">{deletePost.error.message}</p>}
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

function RagPanel({
  token,
  selectedPost,
  onOpenPost,
}: {
  token: string | null
  selectedPost: Post | null
  onOpenPost: (postId: number) => void
}) {
  const [question, setQuestion] = useState('')
  const qa = useMutation({
    mutationFn: () =>
      api<{ answer: string; sources: QaSource[] }>(
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
        <div>
          <p className="eyebrow">Archive search</p>
          <h2>리센느 자료 검색</h2>
        </div>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="예: 최근 원이 영상 뭐 있어? / 러브어택 무대 영상 모아줘"
        />
        <button className="primary" disabled={!token || qa.isPending} title="질문 보내기">
          <Send size={17} />
          검색
        </button>
      </form>
      {qa.error && <p className="error">{qa.error.message}</p>}
      {qa.data && (
        <section className="answer">
          <h2>검색 결과</h2>
          <p>{qa.data.answer}</p>
          <div className="sourceCards">
            {qa.data.sources.map((source, index) => (
              <SourceCard
                key={`${source.source_type}-${source.chunk_id}-${index}`}
                source={source}
                onOpenPost={onOpenPost}
              />
            ))}
          </div>
        </section>
      )}
      <button className="secondary" disabled={!token || !selectedPost} onClick={() => similar.mutate()}>
        유사 글
      </button>
      {similar.data?.map((post) => <p key={post.id}>{post.title}</p>)}
    </div>
  )
}

function SourceCard({ source, onOpenPost }: { source: QaSource; onOpenPost: (postId: number) => void }) {
  const isYoutube = source.source_type === 'youtube'
  const body = (
    <>
      <div className="sourceThumb">
        {isYoutube && source.thumbnail_url ? (
          <img src={source.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <FileText size={22} />
        )}
      </div>
      <div className="sourceBody">
        <span className="sourceType">{isYoutube ? 'YouTube' : '게시글'}</span>
        <strong>{source.title}</strong>
        <small>
          {isYoutube && source.channel_title ? `${source.channel_title} · ` : ''}
          {isYoutube ? `${formatNumber(source.view_count)} views` : formatDate(source.published_at)}
        </small>
        <p>{excerpt(source.content)}</p>
      </div>
    </>
  )
  if (isYoutube) {
    return (
      <a className="sourceCard" href={source.url} target="_blank" rel="noreferrer">
        {body}
        <ExternalLink className="sourceOpen" size={16} />
      </a>
    )
  }
  return (
    <button
      type="button"
      className="sourceCard"
      onClick={() => source.post_id && onOpenPost(source.post_id)}
      disabled={!source.post_id}
    >
      {body}
    </button>
  )
}

function YoutubePanel({ token, user }: { token: string | null; user?: User }) {
  const queryClient = useQueryClient()
  const [videoSort, setVideoSort] = useState<VideoSort>('latest')
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
  const deleteSource = useMutation({
    mutationFn: (sourceId: number) => api<void>(`/youtube-sources/${sourceId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
    },
  })
  const sortedVideos = useMemo(() => {
    const items = [...(videos.data ?? [])]
    return items.sort((left, right) => {
      if (videoSort === 'views') return (right.view_count ?? -1) - (left.view_count ?? -1)
      if (videoSort === 'title') return left.title.localeCompare(right.title)
      return new Date(right.published_at ?? 0).getTime() - new Date(left.published_at ?? 0).getTime()
    })
  }, [videos.data, videoSort])
  return (
    <div className="stack">
      {user?.role !== 'admin' && (
        <div className="emptyState">
          <ShieldCheck size={24} />
          <p>관리자가 동기화한 YouTube 캐시를 보여줍니다.</p>
        </div>
      )}
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
          <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="소스 이름" />
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
          <span key={source.id}>
            {source.title}
            {user?.role === 'admin' && (
              <button
                className="chipButton"
                onClick={() => deleteSource.mutate(source.id)}
                disabled={deleteSource.isPending}
                title="소스 삭제"
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="videoToolbar">
        <span>{formatNumber(videos.data?.length ?? 0)} videos</span>
        <div className="sortGroup">
          <button className={videoSort === 'latest' ? 'active' : ''} onClick={() => setVideoSort('latest')}>
            최신순
          </button>
          <button className={videoSort === 'views' ? 'active' : ''} onClick={() => setVideoSort('views')}>
            조회수
          </button>
          <button className={videoSort === 'title' ? 'active' : ''} onClick={() => setVideoSort('title')}>
            제목
          </button>
        </div>
      </div>
      <div className="videoGrid">
        {sortedVideos.map((video) => (
          <a key={video.id} className="videoItem" href={video.url} target="_blank" rel="noreferrer">
            <div className="videoThumb">
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt="" loading="lazy" />
              ) : (
                <PlayCircle size={24} />
              )}
            </div>
            <div className="videoBody">
              <strong>{video.title}</strong>
              <small>{video.channel_title}</small>
              <span className="videoStats">
                <Eye size={14} />
                {formatNumber(video.view_count)}
                <CalendarDays size={14} />
                {formatDate(video.published_at)}
              </span>
            </div>
          </a>
        ))}
      </div>
      {!videos.isLoading && !videos.data?.length && <p className="muted">No cached videos yet.</p>}
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
        <p>관리자가 발행한 브리핑은 게시판에서 볼 수 있습니다.</p>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="briefingHeader">
        <h2>브리핑 초안</h2>
        <div className="sourceList">
          <span>Board RAG</span>
          <span>YouTube cache</span>
          <span>Naver search</span>
        </div>
      </div>
      <div className="toolbar">
        <button className="secondary" onClick={() => previewMutation.mutate(false)} disabled={previewMutation.isPending}>
          초안 만들기
        </button>
        <button className="secondary" onClick={() => previewMutation.mutate(true)} disabled={previewMutation.isPending}>
          소스 새로고침
        </button>
        <button className="primary" onClick={() => publish.mutate()} disabled={!preview || publish.isPending}>
          게시글 발행
        </button>
      </div>
      {previewMutation.error && <p className="error">{previewMutation.error.message}</p>}
      {publish.error && <p className="error">{publish.error.message}</p>}
      {publish.data && <p className="success">Published: {publish.data.title}</p>}
      {preview && <pre className="preview">{preview.preview_markdown}</pre>}
    </div>
  )
}

function AdminPanel({ token, user }: { token: string | null; user?: User }) {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['infra-cost-settings', token],
    queryFn: () => api<InfraCostSettings>('/admin/settings/infra-cost', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const [form, setForm] = useState<InfraCostSettings | null>(null)
  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])
  const update = useMutation({
    mutationFn: () =>
      api<InfraCostSettings>(
        '/admin/settings/infra-cost',
        {
          method: 'PUT',
          body: JSON.stringify({
            hard_stop_enabled: form?.hard_stop_enabled ?? true,
            manual_hard_stop: form?.manual_hard_stop ?? false,
            monthly_budget_usd: form?.monthly_budget_usd ?? 0,
            railway_subscription_monthly_usd: form?.railway_subscription_monthly_usd ?? 0,
            railway_backend_estimated_monthly_usd: form?.railway_backend_estimated_monthly_usd ?? 0,
            railway_db_estimated_monthly_usd: form?.railway_db_estimated_monthly_usd ?? 0,
            vercel_estimated_monthly_usd: form?.vercel_estimated_monthly_usd ?? 0,
          }),
        },
        token,
      ),
    onSuccess: (data) => {
      setForm(data)
      queryClient.setQueryData(['infra-cost-settings', token], data)
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })
  if (user?.role !== 'admin') {
    return (
      <div className="emptyState">
        <ShieldCheck size={24} />
        <p>Admin settings are admin-only.</p>
      </div>
    )
  }
  if (!form) return <p className="muted">Loading...</p>
  const setNumber = (key: keyof InfraCostSettings, value: string) => {
    setForm({ ...form, [key]: Number(value) || 0 })
  }
  const ratio = Math.round(form.budget_ratio * 100)
  return (
    <div className="stack">
      <section className={form.hard_stopped ? 'adminBudget stopped' : 'adminBudget'}>
        <div className="postHead">
          <div>
            <h2>Cost hard stop</h2>
            <p className="muted">
              {form.period_start} - {form.next_reset}
            </p>
          </div>
          <span className="role">
            <Gauge size={15} />
            {form.hard_stopped ? 'stopped' : 'running'}
          </span>
        </div>
        <div className="budgetStats">
          <span>Budget ${form.monthly_budget_usd.toFixed(2)}</span>
          <span>Estimated ${form.estimated_monthly_usd.toFixed(2)}/mo</span>
          <span>Elapsed ${form.elapsed_estimated_usd.toFixed(2)}</span>
          <span>{ratio}%</span>
        </div>
        <form
          className="budgetForm"
          onSubmit={(event) => {
            event.preventDefault()
            update.mutate()
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={form.hard_stop_enabled}
              onChange={(event) => setForm({ ...form, hard_stop_enabled: event.target.checked })}
            />
            Auto hard stop
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.manual_hard_stop}
              onChange={(event) => setForm({ ...form, manual_hard_stop: event.target.checked })}
            />
            Manual stop
          </label>
          <label>
            Monthly budget
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.monthly_budget_usd}
              onChange={(event) => setNumber('monthly_budget_usd', event.target.value)}
            />
          </label>
          <label>
            Railway subscription
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.railway_subscription_monthly_usd}
              onChange={(event) => setNumber('railway_subscription_monthly_usd', event.target.value)}
            />
          </label>
          <label>
            Railway backend
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.railway_backend_estimated_monthly_usd}
              onChange={(event) => setNumber('railway_backend_estimated_monthly_usd', event.target.value)}
            />
          </label>
          <label>
            Railway DB
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.railway_db_estimated_monthly_usd}
              onChange={(event) => setNumber('railway_db_estimated_monthly_usd', event.target.value)}
            />
          </label>
          <label>
            Vercel
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.vercel_estimated_monthly_usd}
              onChange={(event) => setNumber('vercel_estimated_monthly_usd', event.target.value)}
            />
          </label>
          <button className="primary" disabled={update.isPending}>
            Save
          </button>
        </form>
        {settings.error && <p className="error">{settings.error.message}</p>}
        {update.error && <p className="error">{update.error.message}</p>}
      </section>
    </div>
  )
}
