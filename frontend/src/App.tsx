import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Home,
  LogIn,
  LogOut,
  MessageSquare,
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
  X,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArtistArchiveTerm,
  ArtistKeyword,
  AuthResponse,
  BriefingPreview,
  Comment,
  InfraCostSettings,
  Member,
  Post,
  PostEmbed,
  PostList,
  QaSource,
  SavedItem,
  SignupSettings,
  SyncSettings,
  Tag,
  UpdateFeedItem,
  UpdateFeedResponse,
  User,
  YoutubeSource,
  YoutubeSourceType,
  YoutubeVideo,
  api,
} from './api'
import {
  MOBILE_BOTTOM_TAB_PANELS,
  nextBoardMode,
  shouldShowDesktopBoardSidebar,
  type AppPanel,
  type BoardMode,
} from './boardNavigation'
import {
  archiveSearchHintForQuestion,
  buildArchiveAnswerPreview,
  buildArchiveSourceDisplay,
} from './archiveSearch'
import { buildFeedFooterParts, buildFeedMetaParts } from './feedMeta'
import { sortYoutubeVideos, type VideoSort } from './videoSorting'
import { buildYoutubeSourcePayload } from './youtubeSourceForm'

type AuthMode = 'login' | 'signup'
type FeedSource = 'all' | 'youtube' | 'naver' | 'briefing' | 'post'

const youtubeSourceOptions: { value: YoutubeSourceType; label: string; placeholder: string }[] = [
  {
    value: 'official_channel',
    label: '그룹 공식 채널',
    placeholder: 'YouTube channel ID 또는 uploads playlist ID',
  },
  {
    value: 'member_channel',
    label: '멤버 개인 채널',
    placeholder: '예: 원이 개인 YouTube channel ID',
  },
  {
    value: 'fan_channel',
    label: '팬 채널',
    placeholder: '팬 채널 ID 또는 uploads playlist ID',
  },
  {
    value: 'curated_video',
    label: '단일 영상',
    placeholder: 'YouTube video ID',
  },
  {
    value: 'keyword_search',
    label: '키워드 검색',
    placeholder: '예: 리센느 원이',
  },
]

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

function archiveTermTypeLabel(type: ArtistArchiveTerm['term_type']) {
  if (type === 'song') return '곡명'
  if (type === 'album') return '앨범'
  return '활동'
}

function postIdFromUrl(url: string) {
  const match = url.match(/^\/posts\/(\d+)$/)
  return match ? Number(match[1]) : null
}

export default function App() {
  const queryClient = useQueryClient()
  const [token, setToken] = useStoredToken()
  const [panel, setPanel] = useState<AppPanel>('home')
  const [boardMode, setBoardMode] = useState<BoardMode>('list')
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [page, setPage] = useState(1)
  const [authOpen, setAuthOpen] = useState(false)

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

  const requireAuth = () => setAuthOpen(true)
  const openPanel = (nextPanel: AppPanel) => {
    setPanel(nextPanel)
    if (nextPanel === 'board') setBoardMode('list')
  }
  const openPost = (postId: number) => {
    setSelectedPostId(postId)
    setBoardMode((current) => nextBoardMode(current, 'open-post'))
    setPanel('board')
  }
  const showSideBoard =
    shouldShowDesktopBoardSidebar(panel) &&
    !(panel === 'board' && ['list', 'write', 'edit'].includes(boardMode))
  const layoutClassName = [
    'layout',
    panel === 'home' ? 'homeLayout' : '',
    !showSideBoard ? 'singlePane' : '',
    panel === 'board' ? `boardLayout board-${boardMode}` : '',
  ]
    .filter(Boolean)
    .join(' ')

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
            <button className="secondary" onClick={() => setAuthOpen(true)} title="로그인">
              <LogIn size={17} />
              로그인
            </button>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button className={panel === 'home' ? 'active' : ''} onClick={() => openPanel('home')}>
          홈
        </button>
        <button className={panel === 'board' ? 'active' : ''} onClick={() => openPanel('board')}>
          팬 게시판
        </button>
        <button className={panel === 'rag' ? 'active' : ''} onClick={() => openPanel('rag')}>
          아카이브
        </button>
        <button className={panel === 'youtube' ? 'active' : ''} onClick={() => openPanel('youtube')}>
          YouTube
        </button>
        <button className={panel === 'briefing' ? 'active' : ''} onClick={() => openPanel('briefing')}>
          오늘의 요약
        </button>
        <button className={panel === 'saved' ? 'active' : ''} onClick={() => openPanel('saved')}>
          저장한 자료
        </button>
        {me.data?.role === 'admin' && (
          <button className={panel === 'admin' ? 'active' : ''} onClick={() => openPanel('admin')}>
            관리
          </button>
        )}
      </nav>

      {authOpen && (
        <AuthModal
          publicSignupEnabled={signupStatus.data?.public_signup_enabled ?? false}
          setToken={(nextToken) => {
            setToken(nextToken)
            if (nextToken) setAuthOpen(false)
          }}
          onClose={() => setAuthOpen(false)}
        />
      )}

      <main className={layoutClassName}>
        {showSideBoard && (
        <section className="leftPane">
          <BoardListPanel
            compact
            posts={posts.data?.items ?? []}
            loading={posts.isLoading}
            selectedId={selectedPost?.id ?? null}
            total={posts.data?.total ?? 0}
            page={page}
            pageSize={posts.data?.page_size ?? 10}
            search={search}
            tagFilter={tagFilter}
            tags={tags.data ?? []}
            user={me.data}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            onTagChange={(value) => {
              setTagFilter(value)
              setPage(1)
            }}
            onSelect={(id) => {
              setSelectedPostId(id)
              if (panel === 'board') setBoardMode('detail')
            }}
            onPageChange={setPage}
            onWrite={() => {
              setPanel('board')
              setBoardMode('write')
            }}
            onRequireAuth={requireAuth}
          />
        </section>
        )}

        <section className="mainPane">
          {panel === 'home' && (
            <HomePanel
              token={token}
              user={me.data}
              onRequireAuth={requireAuth}
              onOpenPost={openPost}
            />
          )}
          {panel === 'board' && (
            <BoardPanel
              token={token}
              user={me.data}
              mode={boardMode}
              post={selectedPost}
              posts={posts.data?.items ?? []}
              postsLoading={posts.isLoading}
              selectedPostId={selectedPost?.id ?? null}
              total={posts.data?.total ?? 0}
              page={page}
              pageSize={posts.data?.page_size ?? 10}
              search={search}
              tagFilter={tagFilter}
              tags={tags.data ?? []}
              onRequireAuth={requireAuth}
              onSearchChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              onTagChange={(value) => {
                setTagFilter(value)
                setPage(1)
              }}
              onSelectPost={openPost}
              onPageChange={setPage}
              onBackToList={() => setBoardMode((current) => nextBoardMode(current, 'back-to-list'))}
              onStartWrite={() => setBoardMode((current) => nextBoardMode(current, 'start-write'))}
              onStartEdit={() => setBoardMode((current) => nextBoardMode(current, 'start-edit'))}
              onCancel={() => setBoardMode((current) => nextBoardMode(current, 'cancel'))}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ['posts'] })
                void queryClient.invalidateQueries({ queryKey: ['post', selectedPost?.id] })
                void queryClient.invalidateQueries({ queryKey: ['updates'] })
                void queryClient.invalidateQueries({ queryKey: ['comments', selectedPost?.id] })
                void queryClient.invalidateQueries({ queryKey: ['tags'] })
              }}
              onSaved={(postId) => {
                setSelectedPostId(postId)
                setBoardMode((current) => nextBoardMode(current, 'saved'))
              }}
              onDeleted={() => {
                setSelectedPostId(null)
                setBoardMode((current) => nextBoardMode(current, 'deleted'))
              }}
            />
          )}
          {panel === 'rag' && (
            <RagPanel
              token={token}
              selectedPost={selectedPost}
              onRequireAuth={requireAuth}
              onOpenPost={openPost}
            />
          )}
          {panel === 'youtube' && <YoutubePanel token={token} user={me.data} />}
          {panel === 'briefing' && <BriefingPanel token={token} user={me.data} />}
          {panel === 'saved' && (
            <SavedPanel
              token={token}
              user={me.data}
              onRequireAuth={requireAuth}
              onOpenPost={openPost}
            />
          )}
          {panel === 'admin' && <AdminPanel token={token} user={me.data} />}
        </section>
      </main>
      <BottomTabBar panel={panel} onSelect={openPanel} />
    </div>
  )
}

const bottomTabMeta: Record<
  (typeof MOBILE_BOTTOM_TAB_PANELS)[number],
  { label: string; icon: typeof Home }
> = {
  home: { label: '홈', icon: Home },
  board: { label: '게시판', icon: MessageSquare },
  rag: { label: '검색', icon: Search },
  youtube: { label: 'YouTube', icon: PlayCircle },
  saved: { label: '저장', icon: Bookmark },
}

function BottomTabBar({ panel, onSelect }: { panel: AppPanel; onSelect: (panel: AppPanel) => void }) {
  return (
    <nav className="bottomTabBar" aria-label="모바일 하단 탭">
      {MOBILE_BOTTOM_TAB_PANELS.map((tabPanel) => {
        const Icon = bottomTabMeta[tabPanel].icon
        return (
          <button
            key={tabPanel}
            className={panel === tabPanel ? 'active' : ''}
            onClick={() => onSelect(tabPanel)}
          >
            <Icon size={20} />
            <span>{bottomTabMeta[tabPanel].label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function HomePanel({
  token,
  user,
  onRequireAuth,
  onOpenPost,
}: {
  token: string | null
  user?: User
  onRequireAuth: () => void
  onOpenPost: (postId: number) => void
}) {
  const queryClient = useQueryClient()
  const [source, setSource] = useState<FeedSource>('all')
  const [member, setMember] = useState('')
  const [keyword, setKeyword] = useState('')
  const [feedQuery, setFeedQuery] = useState('')
  const [archiveQuestion, setArchiveQuestion] = useState('최근 원이 영상 뭐 있어?')
  const updates = useInfiniteQuery({
    queryKey: ['updates', source, member, keyword, feedQuery],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' })
      if (pageParam) params.set('cursor', pageParam)
      if (source !== 'all') params.set('source', source)
      if (member) params.set('member', member)
      if (keyword) params.set('keyword', keyword)
      if (feedQuery) params.set('q', feedQuery)
      return api<UpdateFeedResponse>(`/artists/1/updates?${params.toString()}`)
    },
    getNextPageParam: (lastPage) =>
      lastPage.has_more && lastPage.next_cursor ? lastPage.next_cursor : undefined,
  })
  const members = useQuery({
    queryKey: ['members', 1],
    queryFn: () => api<Member[]>('/artists/1/members'),
  })
  const artistKeywords = useQuery({
    queryKey: ['artist-keywords', 1],
    queryFn: () => api<ArtistKeyword[]>('/artists/1/keywords'),
  })
  const qa = useMutation({
    mutationFn: () =>
      api<{ answer: string; sources: QaSource[] }>(
        '/ai/qa',
        { method: 'POST', body: JSON.stringify({ question: archiveQuestion, artist_id: 1 }) },
        token,
      ),
  })
  const saveItem = useMutation({
    mutationFn: (item: UpdateFeedItem) =>
      api<SavedItem>(
        '/saved-items',
        {
          method: 'POST',
          body: JSON.stringify({
            item_type: item.item_type,
            item_id: item.id,
            url: item.url,
            title: item.title,
            thumbnail_url: item.thumbnail_url,
            source_label: item.source_label,
          }),
        },
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    },
  })
  const keywordOptions = useMemo(() => {
    const fixed = ['컴백', '무대', '직캠', '라디오', 'Love Attack']
    const fromArtist = artistKeywords.data?.map((item) => item.keyword) ?? []
    return [...new Set([...fixed, ...fromArtist])].slice(0, 14)
  }, [artistKeywords.data])
  const sourceOptions: { value: FeedSource; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'naver', label: 'Naver' },
    { value: 'briefing', label: '오늘의 요약' },
    { value: 'post', label: '팬글' },
  ]
  const examples = ['최근 원이 영상 뭐 있어?', '러브어택 무대 영상 모아줘', '이번 주 리센느 소식 요약해줘']
  const feedItems = updates.data?.pages.flatMap((pageData) => pageData.items) ?? []
  const naverAvailable = updates.data?.pages.every((pageData) => pageData.naver_available) ?? true
  return (
    <div className="homeStack">
      <section className="homeHero">
        <div className="homeIntro">
          <p className="eyebrow">오늘/최근 업데이트</p>
          <h2>리센느 자료 모아보기</h2>
          <p className="muted">YouTube, Naver, 브리핑, 팬 게시글을 시간순으로 모아 봅니다.</p>
        </div>
        <form
          className="archiveSearch"
          onSubmit={(event) => {
            event.preventDefault()
            if (!token) {
              onRequireAuth()
              return
            }
            qa.mutate()
          }}
        >
          <label htmlFor="archive-question">게시글/YouTube 아카이브 검색</label>
          <div className="archiveInput">
            <Search size={18} />
            <input
              id="archive-question"
              value={archiveQuestion}
              onChange={(event) => setArchiveQuestion(event.target.value)}
              placeholder="예: 러브어택 무대 영상 모아줘"
            />
            <button className="primary" disabled={qa.isPending} title="아카이브 검색">
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
          <p className="hint">
            {archiveSearchHintForQuestion(archiveQuestion)}
          </p>
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
          <ArchiveAnswerBlock answer={qa.data.answer} />
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
          <span className="feedCount">{formatNumber(feedItems.length)} items</span>
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
        {naverAvailable === false && (
          <p className="hint">Naver 키 또는 호출이 잠시 unavailable입니다. YouTube/게시글/브리핑은 계속 표시됩니다.</p>
        )}
        {updates.isLoading && <p className="muted">업데이트를 불러오는 중...</p>}
        {updates.error && <p className="error">{updates.error.message}</p>}
        <div className="feedList">
          {feedItems.map((item) => (
            <UpdateFeedCard
              key={item.id}
              item={item}
              onOpenPost={onOpenPost}
              onSave={() => {
                if (!token) {
                  onRequireAuth()
                  return
                }
                saveItem.mutate(item)
              }}
              savePending={saveItem.isPending}
            />
          ))}
        </div>
        {!updates.isLoading && feedItems.length === 0 && (
          <div className="emptyState">
            <FileText size={24} />
            <p>조건에 맞는 업데이트가 없습니다.</p>
          </div>
        )}
        {updates.hasNextPage && (
          <button
            className="loadMore"
            onClick={() => updates.fetchNextPage()}
            disabled={updates.isFetchingNextPage}
          >
            {updates.isFetchingNextPage ? '불러오는 중...' : '더 보기'}
          </button>
        )}
        {saveItem.error && <p className="error">{saveItem.error.message}</p>}
      </section>

      {user?.role === 'admin' && (
        <p className="adminHint">동기화와 오늘의 요약 발행은 상단 YouTube/오늘의 요약 탭에서 관리합니다.</p>
      )}
    </div>
  )
}

function UpdateFeedCard({
  item,
  onOpenPost,
  onSave,
  savePending,
}: {
  item: UpdateFeedItem
  onOpenPost: (postId: number) => void
  onSave: () => void
  savePending: boolean
}) {
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
  const meta = buildFeedMetaParts(item)
  const footer = buildFeedFooterParts(item)
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
          <span className="updateSource">{meta.source}</span>
        </div>
        <strong>{item.title}</strong>
        {item.description && <p>{excerpt(item.description, 130)}</p>}
        <div className="updateFoot">
          <span className="updateTimestamp">{footer.timestamp}</span>
          {footer.stats.map((stat) =>
            stat.type === 'views' ? (
              <span key={stat.type}>
                <Eye size={14} />
                {formatNumber(stat.value)}
              </span>
            ) : (
              <span key={stat.type}>댓글 {formatNumber(stat.value)}</span>
            ),
          )}
          {[...item.member_names.map(memberLabel), ...item.matched_keywords, ...item.tags].slice(0, 4).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
      </div>
    </>
  )
  return (
    <article className="updateCard">
      {isExternal ? (
        <a className="updateMainLink" href={item.url} target="_blank" rel="noreferrer">
          {body}
          <ExternalLink className="sourceOpen" size={16} />
        </a>
      ) : (
        <button
          type="button"
          className="updateMainLink"
          onClick={() => postId && onOpenPost(postId)}
          disabled={!postId}
        >
          {body}
        </button>
      )}
      <button className="saveButton" onClick={onSave} disabled={savePending} title="저장">
        <Bookmark size={16} />
      </button>
    </article>
  )
}

function AuthModal({
  publicSignupEnabled,
  setToken,
  onClose,
}: {
  publicSignupEnabled: boolean
  setToken: (token: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <div className="authModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHead">
          <div>
            <p className="eyebrow">Account</p>
            <h2>로그인</h2>
          </div>
          <button className="iconButton" onClick={onClose} title="닫기">
            <X size={17} />
          </button>
        </div>
        <AuthPanel publicSignupEnabled={publicSignupEnabled} setToken={setToken} />
      </div>
    </div>
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

function BoardListPanel({
  compact = false,
  posts,
  loading,
  selectedId,
  total,
  page,
  pageSize,
  search,
  tagFilter,
  tags,
  user,
  onSearchChange,
  onTagChange,
  onSelect,
  onPageChange,
  onWrite,
  onRequireAuth,
}: {
  compact?: boolean
  posts: Post[]
  loading: boolean
  selectedId: number | null
  total: number
  page: number
  pageSize: number
  search: string
  tagFilter: string
  tags: Tag[]
  user?: User
  onSearchChange: (value: string) => void
  onTagChange: (value: string) => void
  onSelect: (id: number) => void
  onPageChange: (page: number) => void
  onWrite: () => void
  onRequireAuth: () => void
}) {
  return (
    <section className={compact ? 'boardListPanel compact' : 'boardListPanel'}>
      <div className="boardListHead">
        <div>
          <p className="eyebrow">RESCENE BOARD</p>
          <h2>팬 게시판</h2>
        </div>
        <button
          className="primary"
          onClick={() => {
            if (!user) {
              onRequireAuth()
              return
            }
            onWrite()
          }}
        >
          <MessageSquarePlus size={17} />
          글쓰기
        </button>
      </div>
      <div className="boardListTools">
        <div className="searchbar">
          <Search size={17} />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="검색" />
        </div>
        <select className="filterSelect" value={tagFilter} onChange={(event) => onTagChange(event.target.value)}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>
      <PostListView
        compact={compact}
        posts={posts}
        loading={loading}
        selectedId={selectedId}
        onSelect={onSelect}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </section>
  )
}

function PostListView({
  compact = false,
  posts,
  loading,
  selectedId,
  onSelect,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  compact?: boolean
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
      <div className={compact ? 'boardTable compact' : 'boardTable'}>
        <div className="boardHeader">
          {!compact && <span>번호</span>}
          <span>분류</span>
          <span>제목</span>
          {!compact && <span>작성자</span>}
          <span>댓글</span>
          <span>날짜</span>
        </div>
        {posts.map((post, index) => (
          <button
            key={post.id}
            type="button"
            className={post.id === selectedId ? 'boardRow selected' : 'boardRow'}
            onClick={() => onSelect(post.id)}
          >
            {!compact && <span className="boardNumber">{Math.max(total - ((page - 1) * pageSize + index), 1)}</span>}
            <span className="boardCategory">{post.category}</span>
            <span className="boardTitleCell">
              <strong>{post.title}</strong>
              {post.thumbnail_url && <small className="thumbMark">이미지/링크</small>}
              {post.tags.length > 0 && (
                <span className="miniTags">
                  {post.tags.slice(0, 2).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </span>
              )}
            </span>
            {!compact && <span className="boardAuthor">{post.author.display_name}</span>}
            <span className="boardComments">{post.comment_count}</span>
            <span className="boardDate">{formatDate(post.created_at)}</span>
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
  mode,
  post,
  posts,
  postsLoading,
  selectedPostId,
  total,
  page,
  pageSize,
  search,
  tagFilter,
  tags: tagOptions,
  onRequireAuth,
  onSearchChange,
  onTagChange,
  onSelectPost,
  onPageChange,
  onBackToList,
  onStartWrite,
  onStartEdit,
  onCancel,
  onChanged,
  onSaved,
  onDeleted,
}: {
  token: string | null
  user?: User
  mode: BoardMode
  post: Post | null
  posts: Post[]
  postsLoading: boolean
  selectedPostId: number | null
  total: number
  page: number
  pageSize: number
  search: string
  tagFilter: string
  tags: Tag[]
  onRequireAuth: () => void
  onSearchChange: (value: string) => void
  onTagChange: (value: string) => void
  onSelectPost: (id: number) => void
  onPageChange: (page: number) => void
  onBackToList: () => void
  onStartWrite: () => void
  onStartEdit: () => void
  onCancel: () => void
  onChanged: () => void
  onSaved: (postId: number) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('자유')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('자유')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  useEffect(() => {
    setEditTitle(post?.title ?? '')
    setEditCategory(post?.category ?? '자유')
    setEditContent(post?.content ?? '')
    setEditTags(post?.tags.join(', ') ?? '')
  }, [post?.id, post?.title, post?.category, post?.content, post?.tags])

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
            category,
            content,
            artist_id: 1,
            tags: tags.split(',').map((tag) => tag.trim()),
          }),
        },
        token,
      ),
    onSuccess: (createdPost) => {
      setTitle('')
      setCategory('자유')
      setContent('')
      setTags('')
      onChanged()
      onSaved(createdPost.id)
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
            category: editCategory,
            content: editContent,
            tags: editTags.split(',').map((tag) => tag.trim()),
          }),
        },
        token,
      ),
    onSuccess: (updatedPost) => {
      onChanged()
      onSaved(updatedPost.id)
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

  if (mode === 'list') {
    return (
      <BoardListPanel
        posts={posts}
        loading={postsLoading}
        selectedId={selectedPostId}
        total={total}
        page={page}
        pageSize={pageSize}
        search={search}
        tagFilter={tagFilter}
        tags={tagOptions}
        user={user}
        onSearchChange={onSearchChange}
        onTagChange={onTagChange}
        onSelect={onSelectPost}
        onPageChange={onPageChange}
        onWrite={onStartWrite}
        onRequireAuth={onRequireAuth}
      />
    )
  }

  if (mode === 'write') {
    if (!user) {
      return (
        <div className="emptyState">
          <MessageSquarePlus size={24} />
          <p>글쓰기는 로그인 후 사용할 수 있습니다.</p>
          <button className="primary" onClick={onRequireAuth}>
            <LogIn size={17} />
            로그인
          </button>
        </div>
      )
    }
    return (
      <form
        className="composer boardEditor"
        onSubmit={(event) => {
          event.preventDefault()
          createPost.mutate()
        }}
      >
        <div className="boardPageHead">
          <div>
            <p className="eyebrow">WRITE</p>
            <h2>글쓰기</h2>
          </div>
          <button type="button" className="secondary" onClick={onCancel}>
            목록으로
          </button>
        </div>
        <div className="composerTop">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="자유">자유</option>
            <option value="질문">질문</option>
            <option value="뉴스">뉴스</option>
            <option value="영상">영상</option>
            <option value="후기">후기</option>
            <option value="정보">정보</option>
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목을 입력해주세요" />
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="내용을 입력해주세요. 이미지 URL, YouTube URL, 외부 링크는 저장 후 카드로 표시됩니다."
        />
        <UrlPreviewNote content={content} />
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="태그, 태그" />
        <div className="editorActionBar">
          <button type="button" className="secondary" onClick={onCancel}>
            취소
          </button>
          <button className="primary" disabled={createPost.isPending} title="글 작성">
            <MessageSquarePlus size={17} />
            등록하기
          </button>
        </div>
        {createPost.error && <p className="error">{createPost.error.message}</p>}
      </form>
    )
  }

  if (!post) {
    return (
      <div className="emptyState">
        <FileText size={24} />
        <p>선택된 게시글이 없습니다.</p>
        <button className="secondary" onClick={onBackToList}>
          목록으로
        </button>
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <form
        className="composer boardEditor"
        onSubmit={(event) => {
          event.preventDefault()
          updatePost.mutate()
        }}
      >
        <div className="boardPageHead">
          <div>
            <p className="eyebrow">EDIT</p>
            <h2>글 수정</h2>
          </div>
          <button type="button" className="secondary" onClick={onCancel}>
            취소
          </button>
        </div>
        <div className="composerTop">
          <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>
            <option value="자유">자유</option>
            <option value="질문">질문</option>
            <option value="뉴스">뉴스</option>
            <option value="영상">영상</option>
            <option value="후기">후기</option>
            <option value="정보">정보</option>
            <option value="브리핑">브리핑</option>
          </select>
          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="제목" />
        </div>
        <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} placeholder="내용" />
        <UrlPreviewNote content={editContent} />
        <input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="태그, 태그" />
        <div className="editorActionBar">
          <button type="button" className="secondary" onClick={onCancel}>
            취소
          </button>
          <button className="primary" disabled={updatePost.isPending} title="수정 저장">
            <Save size={17} />
            저장
          </button>
        </div>
        {updatePost.error && <p className="error">{updatePost.error.message}</p>}
      </form>
    )
  }

  return (
    <article className="postDetail boardDetailPage">
      <div className="boardPageHead">
        <button className="secondary" onClick={onBackToList}>
          목록으로
        </button>
        {(user?.id === post.author.id || user?.role === 'admin') && (
          <div className="toolbar">
            <button className="secondary" onClick={onStartEdit} title="글 수정">
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
      </div>
      <div className="postHead">
        <div>
          <span className="categoryBadge">{post.category}</span>
          <h2>{post.title}</h2>
          <div className="postMeta">
            <span>{post.author.display_name}</span>
            <span>{formatDate(post.created_at)}</span>
            <span>댓글 {post.comment_count}</span>
          </div>
        </div>
      </div>
      <LinkedText className="postContent" text={post.content} />
      {post.embeds.length > 0 && <EmbedList embeds={post.embeds} onOpenPost={() => undefined} />}
      <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      {deletePost.error && <p className="error">{deletePost.error.message}</p>}
      <div className="comments">
        {comments.data?.map((item) => (
          <p key={item.id}>
            <b>{item.author.display_name}</b> {item.content}
          </p>
        ))}
      </div>
      {user ? (
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
      ) : (
        <button className="secondary commentLogin" onClick={onRequireAuth}>
          <LogIn size={17} />
          로그인하고 댓글 쓰기
        </button>
      )}
    </article>
  )
}

const CLIENT_URL_RE = /(https?:\/\/[^\s<>\]\)"']+)/g

function clientUrls(content: string) {
  return [...new Set([...content.matchAll(CLIENT_URL_RE)].map((match) => match[0].replace(/[.,!?;:]$/, '')))]
}

function UrlPreviewNote({ content }: { content: string }) {
  const urls = clientUrls(content)
  if (urls.length === 0) return null
  return (
    <div className="urlPreviewNote">
      <span>감지된 링크 {urls.length}개</span>
      {urls.slice(0, 3).map((url) => (
        <em key={url}>{url}</em>
      ))}
    </div>
  )
}

function LinkedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(CLIENT_URL_RE)
  return (
    <p className={className}>
      {parts.map((part, index) =>
        part.match(/^https?:\/\//) ? (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={`${index}-${part.slice(0, 8)}`}>{part}</span>
        ),
      )}
    </p>
  )
}

function EmbedList({ embeds, onOpenPost }: { embeds: PostEmbed[]; onOpenPost: (postId: number) => void }) {
  return (
    <div className="embedList">
      {embeds.map((embed, index) => (
        <EmbedCard key={`${embed.type}-${embed.url}-${index}`} embed={embed} onOpenPost={onOpenPost} />
      ))}
    </div>
  )
}

function EmbedCard({ embed, onOpenPost }: { embed: PostEmbed; onOpenPost: (postId: number) => void }) {
  const [expanded, setExpanded] = useState(false)
  const postId = postIdFromUrl(embed.url)
  const title = embed.title || embed.url
  const meta =
    embed.type === 'youtube'
      ? 'YouTube'
      : embed.type === 'image'
        ? 'Image'
        : embed.source_label || embed.provider || 'Link'
  const openAction = embed.url.startsWith('http') ? (
    <a className="secondary" href={embed.url} target="_blank" rel="noreferrer">
      <ExternalLink size={15} />
      원문 보기
    </a>
  ) : (
    <button className="secondary" onClick={() => postId && onOpenPost(postId)} disabled={!postId}>
      <FileText size={15} />
      게시글 보기
    </button>
  )

  if (embed.type === 'image') {
    return (
      <a className="embedCard imageEmbed" href={embed.url} target="_blank" rel="noreferrer">
        <img src={embed.url} alt="" loading="lazy" />
      </a>
    )
  }

  return (
    <article className="embedCard">
      <div className="embedThumb">
        {embed.thumbnail_url ? (
          <img src={embed.thumbnail_url} alt="" loading="lazy" />
        ) : embed.type === 'youtube' ? (
          <PlayCircle size={24} />
        ) : (
          <FileText size={22} />
        )}
      </div>
      <div className="embedBody">
        <div className="updateMeta">
          <span className={`typeBadge ${embed.item_type ?? embed.type}`}>{meta}</span>
          {embed.published_at && <span>{formatDateTime(embed.published_at)}</span>}
        </div>
        <strong>{title}</strong>
        {embed.description && <p>{expanded ? embed.description : excerpt(embed.description, 120)}</p>}
        <div className="embedActions">
          {embed.description && (
            <button className="secondary" onClick={() => setExpanded((value) => !value)}>
              {expanded ? '접기' : '펼쳐보기'}
            </button>
          )}
          {openAction}
        </div>
      </div>
    </article>
  )
}

function RagPanel({
  token,
  selectedPost,
  onRequireAuth,
  onOpenPost,
}: {
  token: string | null
  selectedPost: Post | null
  onRequireAuth: () => void
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
          if (!token) {
            onRequireAuth()
            return
          }
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
        <p className="hint">{archiveSearchHintForQuestion(question)}</p>
        <button className="primary" disabled={qa.isPending} title="질문 보내기">
          <Send size={17} />
          검색
        </button>
      </form>
      {qa.error && <p className="error">{qa.error.message}</p>}
      {qa.data && (
        <section className="answer">
          <h2>검색 결과</h2>
          <ArchiveAnswerBlock answer={qa.data.answer} />
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
      <button
        className="secondary"
        disabled={!selectedPost}
        onClick={() => {
          if (!token) {
            onRequireAuth()
            return
          }
          similar.mutate()
        }}
      >
        유사 글
      </button>
      {similar.data?.map((post) => <p key={post.id}>{post.title}</p>)}
    </div>
  )
}

function ArchiveAnswerBlock({ answer }: { answer: string }) {
  const preview = buildArchiveAnswerPreview(answer)
  return (
    <details className="archiveAnswerBlock">
      <summary>
        <span>AI 요약</span>
        <small>{preview.text}</small>
      </summary>
      <p>{answer}</p>
    </details>
  )
}

function archiveSourceTypeLabel(source: QaSource) {
  if (source.source_type === 'youtube') return 'YouTube'
  if (source.source_type === 'briefing') return '오늘의 요약'
  if (source.source_type === 'naver_news') return 'Naver News'
  if (source.source_type === 'naver_blog') return 'Naver Blog'
  return '게시글'
}

function SourceCard({ source, onOpenPost }: { source: QaSource; onOpenPost: (postId: number) => void }) {
  const isExternal = source.url.startsWith('http')
  const display = buildArchiveSourceDisplay(source)
  const metaParts = [
    source.channel_title || source.source_label || '',
    source.published_at ? formatDateTime(source.published_at) : '',
    source.view_count !== null && source.view_count !== undefined
      ? `${formatNumber(source.view_count)} views`
      : '',
  ].filter(Boolean)
  const body = (
    <>
      <div className="sourceThumb">
        {source.thumbnail_url ? (
          <img src={source.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <FileText size={22} />
        )}
      </div>
      <div className="sourceBody">
        <span className="sourceType">{archiveSourceTypeLabel(source)}</span>
        <strong>{display.title}</strong>
        <small>{metaParts.join(' · ') || formatDate(source.published_at)}</small>
        {display.description && <p>{display.description}</p>}
      </div>
    </>
  )
  if (isExternal) {
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
  const [sourceType, setSourceType] = useState<YoutubeSourceType>('official_channel')
  const selectedSourceOption = youtubeSourceOptions.find((option) => option.value === sourceType)
  const addSource = useMutation({
    mutationFn: () =>
      api<YoutubeSource>(
        '/artists/1/youtube-sources',
        {
          method: 'POST',
          body: JSON.stringify(
            buildYoutubeSourcePayload({
              sourceType,
              sourceTitle,
              sourceValue,
            }),
          ),
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
    mutationFn: () => api<Record<string, number | boolean | string>>('/artists/1/sync-updates', { method: 'POST' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['videos', 1] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
  const deleteSource = useMutation({
    mutationFn: (sourceId: number) => api<void>(`/youtube-sources/${sourceId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
    },
  })
  const sortedVideos = useMemo(() => {
    return sortYoutubeVideos(videos.data ?? [], videoSort)
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
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as YoutubeSourceType)}
          >
            {youtubeSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder={sourceType === 'keyword_search' ? '소스 이름 (비워두면 자동 생성)' : '소스 이름'}
          />
          <input
            value={sourceValue}
            onChange={(event) => setSourceValue(event.target.value)}
            placeholder={selectedSourceOption?.placeholder ?? "channel or video id"}
          />
          <button className="secondary" disabled={addSource.isPending || !sourceValue.trim()} title="소스 추가">
            <Upload size={17} />
            Add
          </button>
          <button type="button" className="primary" onClick={() => sync.mutate()} disabled={sync.isPending} title="동기화">
            <RefreshCw size={17} />
            Sync
          </button>
        </form>
      )}
      {addSource.error && <p className="error">{addSource.error.message}</p>}
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
  const queryClient = useQueryClient()
  const [preview, setPreview] = useState<BriefingPreview | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const previewMutation = useMutation({
    mutationFn: (refresh: boolean) =>
      api<BriefingPreview>(`/ai/briefing/preview?refresh=${refresh}`, { method: 'POST' }, token),
    onSuccess: setPreview,
  })
  const publish = useMutation({
    mutationFn: () => api<Post>(`/ai/briefing/${preview?.run_id}/publish`, { method: 'POST' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
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
        <div>
          <p className="eyebrow">오늘의 리센느 요약</p>
          <h2>발행 전 미리보기</h2>
        </div>
        <div className="sourceList">
          <span>Board RAG</span>
          <span>YouTube cache</span>
          <span>Naver cache/search</span>
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
      {preview && (
        <section className="briefingPreview">
          <div className="briefingSummary">
            {preview.preview_markdown
              .split('\n')
              .filter(Boolean)
              .slice(0, 8)
              .map((line) => (
                <p key={line}>{line}</p>
              ))}
          </div>
          {preview.source_cards.length > 0 && (
            <>
              <h3>출처 카드</h3>
              <EmbedList embeds={preview.source_cards} onOpenPost={() => undefined} />
            </>
          )}
          <button className="secondary" onClick={() => setShowRaw((value) => !value)}>
            {showRaw ? '원문 접기' : '원문 펼쳐보기'}
          </button>
          {showRaw && <pre className="preview">{preview.preview_markdown}</pre>}
        </section>
      )}
    </div>
  )
}

function SavedPanel({
  token,
  user,
  onRequireAuth,
  onOpenPost,
}: {
  token: string | null
  user?: User
  onRequireAuth: () => void
  onOpenPost: (postId: number) => void
}) {
  const queryClient = useQueryClient()
  const savedItems = useQuery({
    queryKey: ['saved-items', token],
    queryFn: () => api<SavedItem[]>('/saved-items', {}, token),
    enabled: Boolean(token && user),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/saved-items/${id}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    },
  })
  if (!user) {
    return (
      <div className="emptyState">
        <Bookmark size={24} />
        <p>보고 싶은 피드와 게시글을 저장하려면 로그인이 필요합니다.</p>
        <button className="primary" onClick={onRequireAuth}>
          <LogIn size={17} />
          로그인
        </button>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Saved</p>
          <h2>저장한 자료</h2>
        </div>
        <span className="feedCount">{formatNumber(savedItems.data?.length ?? 0)} items</span>
      </div>
      {savedItems.isLoading && <p className="muted">저장 항목을 불러오는 중...</p>}
      {savedItems.error && <p className="error">{savedItems.error.message}</p>}
      <div className="feedList">
        {savedItems.data?.map((item) => {
          const postId = postIdFromUrl(item.url)
          const isExternal = item.url.startsWith('http')
          return (
            <article className="updateCard" key={item.id}>
              {isExternal ? (
                <a className="updateMainLink" href={item.url} target="_blank" rel="noreferrer">
                  <SavedItemBody item={item} />
                  <ExternalLink className="sourceOpen" size={16} />
                </a>
              ) : (
                <button
                  className="updateMainLink"
                  onClick={() => postId && onOpenPost(postId)}
                  disabled={!postId}
                >
                  <SavedItemBody item={item} />
                </button>
              )}
              <button className="saveButton" onClick={() => remove.mutate(item.id)} disabled={remove.isPending} title="삭제">
                <Trash2 size={16} />
              </button>
            </article>
          )
        })}
      </div>
      {!savedItems.isLoading && savedItems.data?.length === 0 && (
        <div className="emptyState">
          <Bookmark size={24} />
          <p>아직 저장한 항목이 없습니다.</p>
        </div>
      )}
    </div>
  )
}

function SavedItemBody({ item }: { item: SavedItem }) {
  return (
    <>
      <div className="updateThumb">
        {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" /> : <Bookmark size={24} />}
      </div>
      <div className="updateBody">
        <div className="updateMeta">
          <span className={`typeBadge ${item.item_type}`}>{item.source_label || item.item_type}</span>
          <span>{formatDateTime(item.saved_at)}</span>
        </div>
        <strong>{item.title}</strong>
      </div>
    </>
  )
}

function AdminPanel({ token, user }: { token: string | null; user?: User }) {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['infra-cost-settings', token],
    queryFn: () => api<InfraCostSettings>('/admin/settings/infra-cost', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const syncSettings = useQuery({
    queryKey: ['sync-settings', token],
    queryFn: () => api<SyncSettings>('/admin/settings/sync', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const keywords = useQuery({
    queryKey: ['artist-keywords', 1],
    queryFn: () => api<ArtistKeyword[]>('/artists/1/keywords'),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const archiveTerms = useQuery({
    queryKey: ['artist-archive-terms', 1],
    queryFn: () => api<ArtistArchiveTerm[]>('/artists/1/archive-terms'),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const [form, setForm] = useState<InfraCostSettings | null>(null)
  const [syncForm, setSyncForm] = useState<SyncSettings | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [termType, setTermType] = useState<ArtistArchiveTerm['term_type']>('song')
  const [termTitle, setTermTitle] = useState('')
  const [termAliases, setTermAliases] = useState('')
  const [editingTermId, setEditingTermId] = useState<number | null>(null)
  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])
  useEffect(() => {
    if (syncSettings.data) setSyncForm(syncSettings.data)
  }, [syncSettings.data])
  const addKeyword = useMutation({
    mutationFn: () =>
      api<ArtistKeyword>(
        '/artists/1/keywords',
        {
          method: 'POST',
          body: JSON.stringify({ keyword: keywordInput }),
        },
        token,
      ),
    onSuccess: () => {
      setKeywordInput('')
      void queryClient.invalidateQueries({ queryKey: ['artist-keywords', 1] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
  const deleteKeyword = useMutation({
    mutationFn: (keywordId: number) => api<void>(`/artist-keywords/${keywordId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['artist-keywords', 1] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
  const saveArchiveTerm = useMutation({
    mutationFn: () => {
      const payload = {
        term_type: termType,
        title: termTitle,
        aliases: termAliases
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }
      return api<ArtistArchiveTerm>(
        editingTermId ? `/artist-archive-terms/${editingTermId}` : '/artists/1/archive-terms',
        {
          method: editingTermId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
        token,
      )
    },
    onSuccess: () => {
      setTermType('song')
      setTermTitle('')
      setTermAliases('')
      setEditingTermId(null)
      void queryClient.invalidateQueries({ queryKey: ['artist-archive-terms', 1] })
    },
  })
  const deleteArchiveTerm = useMutation({
    mutationFn: (termId: number) => api<void>(`/artist-archive-terms/${termId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['artist-archive-terms', 1] })
    },
  })
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
  const updateSync = useMutation({
    mutationFn: () =>
      api<SyncSettings>(
        '/admin/settings/sync',
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled: syncForm?.enabled ?? true,
            official_interval_minutes: syncForm?.official_interval_minutes ?? 180,
            member_interval_minutes: syncForm?.member_interval_minutes ?? 120,
            fan_interval_minutes: syncForm?.fan_interval_minutes ?? 60,
            curated_interval_minutes: syncForm?.curated_interval_minutes ?? 720,
            naver_interval_minutes: syncForm?.naver_interval_minutes ?? 60,
            keyword_interval_minutes: syncForm?.keyword_interval_minutes ?? 120,
          }),
        },
        token,
      ),
    onSuccess: (data) => {
      setSyncForm(data)
      queryClient.setQueryData(['sync-settings', token], data)
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
  if (!form || !syncForm) return <p className="muted">Loading...</p>
  const setNumber = (key: keyof InfraCostSettings, value: string) => {
    setForm({ ...form, [key]: Number(value) || 0 })
  }
  const setSyncNumber = (key: keyof SyncSettings, value: string) => {
    setSyncForm({ ...syncForm, [key]: Number(value) || 0 })
  }
  const ratio = Math.round(form.budget_ratio * 100)
  return (
    <div className="stack">
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>Home keywords</h2>
            <p className="muted">홈 필터에 노출할 리센느 키워드를 관리합니다.</p>
          </div>
        </div>
        <form
          className="inlineForm keywordAdminForm"
          onSubmit={(event) => {
            event.preventDefault()
            addKeyword.mutate()
          }}
        >
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="예: 컴백, 라디오, Love Attack"
          />
          <button className="primary" disabled={!keywordInput.trim() || addKeyword.isPending}>
            <Save size={17} />
            추가
          </button>
        </form>
        <div className="sourceList">
          {keywords.data?.map((item) => (
            <span key={item.id}>
              {item.keyword}
              <button
                className="chipButton"
                onClick={() => deleteKeyword.mutate(item.id)}
                disabled={deleteKeyword.isPending}
                title="키워드 삭제"
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
        {addKeyword.error && <p className="error">{addKeyword.error.message}</p>}
        {deleteKeyword.error && <p className="error">{deleteKeyword.error.message}</p>}
      </section>
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>Archive search dictionary</h2>
            <p className="muted">곡명, 앨범명, 활동명 alias를 관리합니다. 아카이브 검색 결과 필터에 사용됩니다.</p>
          </div>
        </div>
        <form
          className="budgetForm archiveTermForm"
          onSubmit={(event) => {
            event.preventDefault()
            saveArchiveTerm.mutate()
          }}
        >
          <label>
            Type
            <select
              value={termType}
              onChange={(event) => setTermType(event.target.value as ArtistArchiveTerm['term_type'])}
            >
              <option value="song">곡명</option>
              <option value="album">앨범</option>
              <option value="activity">활동명</option>
            </select>
          </label>
          <label>
            Title
            <input
              value={termTitle}
              onChange={(event) => setTermTitle(event.target.value)}
              placeholder="예: Love Attack"
            />
          </label>
          <label>
            Aliases
            <input
              value={termAliases}
              onChange={(event) => setTermAliases(event.target.value)}
              placeholder="예: 러브어택, 러브 어택, LOVE ATTACK"
            />
          </label>
          <button className="primary" disabled={!termTitle.trim() || saveArchiveTerm.isPending}>
            <Save size={17} />
            {editingTermId ? '수정' : '추가'}
          </button>
          {editingTermId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingTermId(null)
                setTermType('song')
                setTermTitle('')
                setTermAliases('')
              }}
            >
              취소
            </button>
          )}
        </form>
        <div className="sourceList archiveTermList">
          {archiveTerms.data?.map((item) => (
            <span key={item.id}>
              <strong>{archiveTermTypeLabel(item.term_type)}</strong>
              {item.title}
              {item.aliases.length > 0 && <em>{item.aliases.join(', ')}</em>}
              <button
                className="chipButton"
                onClick={() => {
                  setEditingTermId(item.id)
                  setTermType(item.term_type)
                  setTermTitle(item.title)
                  setTermAliases(item.aliases.join(', '))
                }}
                title="사전 항목 수정"
              >
                <Edit3 size={13} />
              </button>
              <button
                className="chipButton"
                onClick={() => deleteArchiveTerm.mutate(item.id)}
                disabled={deleteArchiveTerm.isPending}
                title="사전 항목 삭제"
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
        {archiveTerms.error && <p className="error">{archiveTerms.error.message}</p>}
        {saveArchiveTerm.error && <p className="error">{saveArchiveTerm.error.message}</p>}
        {deleteArchiveTerm.error && <p className="error">{deleteArchiveTerm.error.message}</p>}
      </section>
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>Live feed sync</h2>
            <p className="muted">외부 API는 이 주기마다 백그라운드에서 갱신하고, 사용자는 DB 캐시만 읽습니다.</p>
          </div>
          <span className="role">{syncForm.enabled ? 'auto' : 'paused'}</span>
        </div>
        <div className="budgetStats">
          <span>Official last {formatDateTime(syncForm.last_official_sync_at)}</span>
          <span>Member last {formatDateTime(syncForm.last_member_sync_at)}</span>
          <span>Fan last {formatDateTime(syncForm.last_fan_sync_at)}</span>
          <span>Curated last {formatDateTime(syncForm.last_curated_sync_at)}</span>
          <span>Naver last {formatDateTime(syncForm.last_naver_sync_at)}</span>
          <span>Keyword last {formatDateTime(syncForm.last_keyword_sync_at)}</span>
        </div>
        <form
          className="budgetForm"
          onSubmit={(event) => {
            event.preventDefault()
            updateSync.mutate()
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={syncForm.enabled}
              onChange={(event) => setSyncForm({ ...syncForm, enabled: event.target.checked })}
            />
            Auto sync
          </label>
          <label>
            Official channel
            <input
              type="number"
              min="30"
              max="1440"
              step="30"
              value={syncForm.official_interval_minutes}
              onChange={(event) => setSyncNumber('official_interval_minutes', event.target.value)}
            />
          </label>
          <label>
            Member channel
            <input
              type="number"
              min="30"
              max="1440"
              step="30"
              value={syncForm.member_interval_minutes}
              onChange={(event) => setSyncNumber('member_interval_minutes', event.target.value)}
            />
          </label>
          <label>
            Fan channel
            <input
              type="number"
              min="15"
              max="1440"
              step="15"
              value={syncForm.fan_interval_minutes}
              onChange={(event) => setSyncNumber('fan_interval_minutes', event.target.value)}
            />
          </label>
          <label>
            Curated video
            <input
              type="number"
              min="60"
              max="1440"
              step="60"
              value={syncForm.curated_interval_minutes}
              onChange={(event) => setSyncNumber('curated_interval_minutes', event.target.value)}
            />
          </label>
          <label>
            Naver
            <input
              type="number"
              min="15"
              max="1440"
              step="15"
              value={syncForm.naver_interval_minutes}
              onChange={(event) => setSyncNumber('naver_interval_minutes', event.target.value)}
            />
          </label>
          <label>
            Keyword search
            <input
              type="number"
              min="60"
              max="1440"
              step="60"
              value={syncForm.keyword_interval_minutes}
              onChange={(event) => setSyncNumber('keyword_interval_minutes', event.target.value)}
            />
          </label>
          <button className="primary" disabled={updateSync.isPending}>
            Save sync
          </button>
        </form>
        {syncSettings.error && <p className="error">{syncSettings.error.message}</p>}
        {updateSync.error && <p className="error">{updateSync.error.message}</p>}
      </section>
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
