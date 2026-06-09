import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
  Moon,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArtistArchiveTerm,
  ArtistKeyword,
  AnalyticsEvent,
  AnalyticsSummary,
  AuthResponse,
  BriefingPreview,
  Comment,
  EmailVerificationSendResponse,
  InfraCostSettings,
  Member,
  Post,
  PostEmbed,
  PostList,
  QaResponse,
  QaSource,
  RagContextResponse,
  RagCleanupResult,
  RagCoverage,
  RagEmbeddingJob,
  SavedItem,
  SignupSettings,
  SyncSettings,
  Tag,
  UpdateFeedItem,
  UpdateFeedResponse,
  User,
  YoutubeBackfillResult,
  YoutubeSource,
  YoutubeSourceType,
  YoutubeVideo,
  API_BASE,
  api,
} from './api'
import { shouldTrackPanelView, trackAnalyticsEvent, type AnalyticsMetadata } from './analytics'
import {
  configuredOauthProviders,
  getInitialAccessToken,
  oauthStartUrl,
  oauthProviderLabels,
  type OAuthProvider,
  type OAuthStatus,
  shouldShowVerificationPrompt,
  storeAccessToken,
} from './authSession'
import {
  desktopTabPanelsForRole,
  MOBILE_BOTTOM_TAB_PANELS,
  nextBoardMode,
  shouldScrollToTopOnRepeatedMobileTab,
  shouldShowBackToTopButton,
  shouldShowDesktopBoardSidebar,
  type AppPanel,
  type BoardMode,
} from './boardNavigation'
import {
  archiveSearchHintForQuestion,
  buildArchiveAnswerPreview,
  buildArchiveSourceDisplay,
} from './archiveSearch'
import {
  appendReferenceText,
  buildWritingAssistQuery,
  canSummarizeSavedItems,
  shouldRequestWritingAssist,
} from './ragContext'
import { adminActivityEventsPath, adminActivitySummaryPath } from './adminAnalytics'
import {
  parseBriefingContent,
  shouldUseBriefingContent,
  type BriefingContentItem,
  type ParsedBriefingContent,
} from './briefingContent'
import { findBriefingEmbedForLink } from './briefingEmbeds'
import { buildFeedFooterParts, buildFeedMetaParts } from './feedMeta'
import { selectHomeHeroItem } from './homeHero'
import {
  findSavedFeedItem,
  mergeSavedItem,
  optimisticSavedItemFromFeedItem,
  removeSavedItemFromList,
  savedFeedItemPayload,
} from './savedFeed'
import { sortYoutubeVideos, type VideoSort } from './videoSorting'
import { canUseYoutubeHoverPreview, youtubeAppUrl, youtubeEmbedPreviewUrl } from './youtubeLinks'
import { buildYoutubeSourcePayload } from './youtubeSourceForm'
import { MEMBER_COLORS, MEMBER_ORDER, memberColor, memberOn } from './memberColors'
import { compactMemberNamesText, memberLabel, memberNamesText } from './memberDisplay'
import { getPasswordRuleStatus, isStrongPassword, passwordRequirementText } from './passwordRules'
import { emailVerificationStatusText } from './emailVerification'

type FeedSource = 'all' | 'youtube' | 'naver' | 'briefing' | 'post'
type Theme = 'light' | 'dark'

const VIDEO_RENDER_STEP = 48

const topTabLabels: Record<AppPanel, string> = {
  home: '홈',
  board: '팬 게시판',
  rag: '아카이브',
  youtube: 'YouTube',
  briefing: '오늘의 요약',
  saved: '저장한 자료',
  admin: '관리',
}

const CATEGORY_COLORS: Record<string, { color: string; lightText: string; darkText: string }> = {
  자유: { color: '#64748B', lightText: '#334155', darkText: '#CBD5E1' },
  질문: { color: '#2563EB', lightText: '#1D4ED8', darkText: '#93C5FD' },
  뉴스: { color: '#16A34A', lightText: '#166534', darkText: '#86EFAC' },
  영상: { color: '#DC2626', lightText: '#B91C1C', darkText: '#FCA5A5' },
  후기: { color: '#D97706', lightText: '#92400E', darkText: '#FCD34D' },
  정보: { color: '#7C3AED', lightText: '#6D28D9', darkText: '#C4B5FD' },
  브리핑: { color: 'var(--accent)', lightText: 'var(--accent)', darkText: 'var(--accent)' },
}

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
  const [token, setToken] = useState(() => getInitialAccessToken())
  const saveToken = (next: string | null) => {
    storeAccessToken(next)
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

function MemberSpectrum({ theme, className = '' }: { theme: Theme; className?: string }) {
  return (
    <span className={['spectrum', className].filter(Boolean).join(' ')} aria-hidden="true">
      {MEMBER_ORDER.map((name) => (
        <i key={name} style={{ backgroundColor: memberColor(name, theme) }} />
      ))}
    </span>
  )
}

function MemberAvatar({ name, theme, size = 24 }: { name: string; theme: Theme; size?: number }) {
  const label = memberLabel(name)
  return (
    <span
      className="memAva"
      style={
        {
          backgroundColor: memberColor(name, theme),
          color: memberOn(name, theme),
          height: size,
          width: size,
          fontSize: Math.max(10, Math.round(size * 0.42)),
        } as CSSProperties
      }
      title={label}
    >
      {label.slice(0, 1) || name.slice(0, 1)}
    </span>
  )
}

function memberNamesFromText(...parts: Array<string | null | undefined>) {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase()
  return MEMBER_ORDER.filter((name) => {
    const member = MEMBER_COLORS[name]
    return haystack.includes(name.toLowerCase()) || haystack.includes(member.ko)
  })
}

function categoryBadgeStyle(category: string, theme: Theme) {
  const palette = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.자유
  return {
    '--cat-color': palette.color,
    '--cat-text': theme === 'dark' ? palette.darkText : palette.lightText,
  } as CSSProperties
}

function CategoryBadge({
  category,
  theme,
  className = 'categoryBadge',
}: {
  category: string
  theme: Theme
  className?: string
}) {
  return (
    <span className={className} style={categoryBadgeStyle(category, theme)}>
      {category}
    </span>
  )
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

function YoutubeAppLink({
  url,
  className = 'youtubeAppButton',
  label = '앱',
  panel,
  metadata,
}: {
  url: string
  className?: string
  label?: string
  panel?: string
  metadata?: AnalyticsMetadata
}) {
  const appUrl = youtubeAppUrl(url)
  if (!appUrl) return null
  const videoId = appUrl.split('/').pop() ?? ''
  return (
    <a
      className={className}
      href={appUrl}
      onClick={(event) => {
        event.stopPropagation()
        trackAnalyticsEvent({
          eventName: 'youtube_app_open',
          panel,
          metadata: { source: 'youtube', video_id: videoId, ...metadata },
        })
      }}
      title="YouTube 앱으로 열기"
      aria-label="YouTube 앱으로 열기"
    >
      <PlayCircle size={16} />
      <span>{label}</span>
    </a>
  )
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
  const [verificationNotice, setVerificationNotice] = useState('')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('rescene_theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

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
  const emailVerificationEnabled =
    adminSignupSettings.data?.email_verification_enabled ?? signupStatus.data?.email_verification_enabled ?? false
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
  const resendVerification = useMutation({
    mutationFn: () => api<EmailVerificationSendResponse>('/auth/email/verification', { method: 'POST' }, token),
    onSuccess: (data) => setVerificationNotice(emailVerificationStatusText(data)),
    onError: (error) => setVerificationNotice(error instanceof Error ? error.message : '인증 메일 전송 실패'),
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

  useEffect(() => {
    const verifyToken = new URLSearchParams(window.location.search).get('verify_email')
    if (verifyToken) {
      api<User>('/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
      })
        .then(() => {
          window.history.replaceState({}, '', window.location.pathname)
          void queryClient.invalidateQueries({ queryKey: ['me'] })
        })
        .catch(() => undefined)
    }
    if (token) return
    api<AuthResponse>('/auth/refresh', { method: 'POST' })
      .then((data) => setToken(data.access_token))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    trackAnalyticsEvent({ eventName: 'app_open', panel: 'home', token })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('rescene_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!shouldTrackPanelView(panel)) return
    trackAnalyticsEvent({ eventName: 'panel_view', panel, token })
  }, [panel, token])

  useEffect(() => {
    if (me.isLoading) return
    if ((panel === 'briefing' || panel === 'admin') && me.data?.role !== 'admin') {
      setPanel('home')
    }
  }, [me.data?.role, me.isLoading, panel])

  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(shouldShowBackToTopButton(window.scrollY))
    updateBackToTop()
    window.addEventListener('scroll', updateBackToTop, { passive: true })
    return () => window.removeEventListener('scroll', updateBackToTop)
  }, [])

  const logout = () => {
    void api<void>('/auth/logout', { method: 'POST' }, token).catch(() => undefined)
    setToken(null)
    void queryClient.invalidateQueries()
  }

  const requireAuth = () => setAuthOpen(true)
  const requireVerified = () => {
    if (!me.data) {
      requireAuth()
      return false
    }
    if (shouldShowVerificationPrompt(me.data, emailVerificationEnabled)) {
      resendVerification.mutate()
      return false
    }
    return true
  }
  const openPanel = (nextPanel: AppPanel) => {
    setPanel(nextPanel)
    if (nextPanel === 'board') setBoardMode('list')
  }
  const scrollToPageTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openBottomPanel = (nextPanel: AppPanel) => {
    if (shouldScrollToTopOnRepeatedMobileTab(panel, nextPanel)) {
      scrollToPageTop()
      return
    }
    openPanel(nextPanel)
  }
  const openPost = (postId: number) => {
    trackAnalyticsEvent({
      eventName: 'post_open',
      panel: 'board',
      metadata: { post_id: postId },
      token,
    })
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
        <div className="topbarBrand">
          <span className="wordmark">RESCENE</span>
          <MemberSpectrum theme={theme} />
        </div>
        <div className="session">
          <button
            className="iconButton"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? '라이트 테마' : '다크 테마'}
            aria-label={theme === 'dark' ? '라이트 테마로 변경' : '다크 테마로 변경'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
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
        {desktopTabPanelsForRole(me.data?.role).map((tabPanel) => (
          <button
            key={tabPanel}
            className={panel === tabPanel ? 'active' : ''}
            onClick={() => openPanel(tabPanel)}
          >
            {topTabLabels[tabPanel]}
          </button>
        ))}
      </nav>

      {authOpen && (
        <AuthModal
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
            theme={theme}
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
              if (!requireVerified()) return
              setPanel('board')
              setBoardMode('write')
            }}
            onRequireAuth={requireAuth}
          />
        </section>
        )}

        <section className="mainPane">
          {shouldShowVerificationPrompt(me.data, emailVerificationEnabled) && (
            <div className="verifyBanner">
              <span>이메일 인증 후 글쓰기, 댓글, 저장, AI 검색을 사용할 수 있습니다.</span>
              <button
                className="secondary"
                onClick={() => resendVerification.mutate()}
                disabled={resendVerification.isPending}
              >
                인증 메일 다시 보내기
              </button>
              {verificationNotice && <small>{verificationNotice}</small>}
            </div>
          )}
          {panel === 'home' && (
            <HomePanel
              token={token}
              user={me.data}
              onRequireAuth={requireAuth}
              onRequireVerified={requireVerified}
              onOpenPost={openPost}
              theme={theme}
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
              theme={theme}
              onRequireAuth={requireAuth}
              onRequireVerified={requireVerified}
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
              onRequireVerified={requireVerified}
              onOpenPost={openPost}
            />
          )}
          {panel === 'youtube' && <YoutubePanel token={token} user={me.data} theme={theme} />}
          {panel === 'briefing' && <BriefingPanel token={token} user={me.data} />}
          {panel === 'saved' && (
            <SavedPanel
              token={token}
              user={me.data}
              theme={theme}
              onRequireAuth={requireAuth}
              onOpenPost={openPost}
            />
          )}
          {panel === 'admin' && <AdminPanel token={token} user={me.data} />}
        </section>
      </main>
      {showBackToTop && (
        <button className="backToTopButton" onClick={scrollToPageTop} title="맨 위로" aria-label="맨 위로 이동">
          <ChevronUp size={22} />
        </button>
      )}
      <BottomTabBar panel={panel} onSelect={openBottomPanel} />
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

function heroCtaLabel(item: UpdateFeedItem) {
  if (item.item_type === 'youtube') return '영상 보기'
  if (item.item_type === 'naver_news' || item.item_type === 'naver_blog') return '원문 보기'
  return '자세히 보기'
}

function HomeHero({
  item,
  theme,
  token,
  onOpenPost,
}: {
  item: UpdateFeedItem
  theme: Theme
  token: string | null
  onOpenPost: (postId: number) => void
}) {
  const primaryMember = item.member_names[0] ?? ''
  const postId = postIdFromUrl(item.url)
  const isExternal = item.url.startsWith('http')
  const isYoutube = item.item_type === 'youtube'
  const previewUrl = isYoutube ? youtubeEmbedPreviewUrl(item.url) : null
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const ctaLabel = heroCtaLabel(item)
  const analyticsMetadata = {
    item_type: item.item_type,
    item_key: item.id,
    title: item.title,
    source_label: item.source_label,
  }
  const trackHeroOpen = () => {
    trackAnalyticsEvent({
      eventName: 'feed_card_open',
      panel: 'home',
      token,
      metadata: analyticsMetadata,
    })
  }
  const clearPreviewTimer = () => {
    if (!previewTimerRef.current) return
    clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }
  const schedulePreview = () => {
    if (!previewUrl || !canUseYoutubeHoverPreview()) return
    clearPreviewTimer()
    previewTimerRef.current = setTimeout(() => {
      setPreviewVisible(true)
      previewTimerRef.current = null
    }, 500)
  }
  const hidePreview = () => {
    clearPreviewTimer()
    setPreviewVisible(false)
  }
  useEffect(() => {
    hidePreview()
    return clearPreviewTimer
  }, [previewUrl])
  return (
    <section
      className="hero"
      onMouseEnter={schedulePreview}
      onMouseLeave={hidePreview}
      onFocus={schedulePreview}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          hidePreview()
        }
      }}
      style={{ '--mcol': primaryMember ? memberColor(primaryMember, theme) : 'var(--border-strong)' } as CSSProperties}
    >
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" loading="eager" referrerPolicy="no-referrer" />
      ) : (
        <div className="heroFallback">
          <FileText size={36} />
        </div>
      )}
      {previewVisible && previewUrl && (
        <iframe
          className="heroPreviewFrame"
          src={previewUrl}
          title={`${item.title} 미리보기`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      <div className="heroOverlay" />
      <div className="heroContent">
        <div className="heroKicker">
          <MemberSpectrum theme={theme} />
          오늘의 하이라이트
        </div>
        <h1 className="serif">{item.title}</h1>
        <div className="heroMeta">
          <span className="heroAvatars">
            {item.member_names.slice(0, 5).map((name) => (
              <MemberAvatar key={name} name={name} theme={theme} size={28} />
            ))}
          </span>
          <span>
            {formatDate(item.published_at)} · 조회수 {formatNumber(item.view_count)}
          </span>
        </div>
      </div>
      {isYoutube ? (
        <a
          className="heroCta"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.stopPropagation()
            trackHeroOpen()
          }}
        >
          <PlayCircle size={16} />
          <span>{ctaLabel}</span>
        </a>
      ) : isExternal ? (
        <a
          className="heroCta"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.stopPropagation()
            trackHeroOpen()
          }}
        >
          <ExternalLink size={16} />
          <span>{ctaLabel}</span>
        </a>
      ) : (
        <button
          type="button"
          className="heroCta"
          disabled={!postId}
          onClick={(event) => {
            event.stopPropagation()
            trackHeroOpen()
            if (postId) onOpenPost(postId)
          }}
        >
          <ChevronRight size={16} />
          <span>{ctaLabel}</span>
        </button>
      )}
    </section>
  )
}

function HomePanel({
  token,
  user,
  onRequireAuth,
  onRequireVerified,
  onOpenPost,
  theme,
}: {
  token: string | null
  user?: User
  onRequireAuth: () => void
  onRequireVerified: () => boolean
  onOpenPost: (postId: number) => void
  theme: Theme
}) {
  const queryClient = useQueryClient()
  const [source, setSource] = useState<FeedSource>('all')
  const [member, setMember] = useState('')
  const [keyword, setKeyword] = useState('')
  const [feedQuery, setFeedQuery] = useState('')
  const [pendingSavedKeys, setPendingSavedKeys] = useState<Set<string>>(() => new Set())
  const [saveError, setSaveError] = useState('')
  const savedItemsQueryKey = ['saved-items', token] as const
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
  const savedItems = useQuery({
    queryKey: savedItemsQueryKey,
    queryFn: () => api<SavedItem[]>('/saved-items', {}, token),
    enabled: Boolean(token && user),
    retry: false,
  })
  const saveItem = useMutation({
    mutationFn: (item: UpdateFeedItem) =>
      api<SavedItem>(
        '/saved-items',
        {
          method: 'POST',
          body: JSON.stringify(savedFeedItemPayload(item)),
        },
        token,
      ),
    onMutate: async (item) => {
      setSaveError('')
      const optimisticItem = optimisticSavedItemFromFeedItem(item)
      setPendingSavedKeys((current) => new Set(current).add(optimisticItem.item_key))
      await queryClient.cancelQueries({ queryKey: savedItemsQueryKey })
      const previousItems = queryClient.getQueryData<SavedItem[]>(savedItemsQueryKey)
      queryClient.setQueryData<SavedItem[]>(savedItemsQueryKey, (current) =>
        mergeSavedItem(current, optimisticItem),
      )
      return { previousItems, optimisticItem }
    },
    onError: (_error, _item, context) => {
      queryClient.setQueryData(savedItemsQueryKey, context?.previousItems)
      setSaveError('저장 처리에 실패했습니다. 다시 시도해 주세요.')
    },
    onSuccess: (data, item) => {
      queryClient.setQueryData<SavedItem[]>(savedItemsQueryKey, (current) => mergeSavedItem(current, data))
      trackAnalyticsEvent({
        eventName: 'saved_item_add',
        panel: 'home',
        token,
        metadata: {
          item_type: item.item_type,
          item_key: item.id,
          title: item.title,
          source_label: item.source_label,
        },
      })
    },
    onSettled: (_data, _error, item, context) => {
      const itemKey = context?.optimisticItem.item_key ?? item?.id
      if (!itemKey) return
      setPendingSavedKeys((current) => {
        const next = new Set(current)
        next.delete(itemKey)
        return next
      })
    },
  })
  const removeSavedItem = useMutation({
    mutationFn: (savedItem: SavedItem) => api<void>(`/saved-items/${savedItem.id}`, { method: 'DELETE' }, token),
    onMutate: async (savedItem) => {
      setSaveError('')
      setPendingSavedKeys((current) => new Set(current).add(savedItem.item_key))
      await queryClient.cancelQueries({ queryKey: savedItemsQueryKey })
      const previousItems = queryClient.getQueryData<SavedItem[]>(savedItemsQueryKey)
      queryClient.setQueryData<SavedItem[]>(savedItemsQueryKey, (current) =>
        removeSavedItemFromList(current, savedItem),
      )
      return { previousItems, savedItem }
    },
    onError: (_error, _savedItem, context) => {
      queryClient.setQueryData(savedItemsQueryKey, context?.previousItems)
      setSaveError('저장 해제에 실패했습니다. 다시 시도해 주세요.')
    },
    onSettled: (_data, _error, savedItem, context) => {
      const itemKey = context?.savedItem.item_key ?? savedItem?.item_key
      if (!itemKey) return
      setPendingSavedKeys((current) => {
        const next = new Set(current)
        next.delete(itemKey)
        return next
      })
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
  const feedItems = updates.data?.pages.flatMap((pageData) => pageData.items) ?? []
  const naverAvailable = updates.data?.pages.every((pageData) => pageData.naver_available) ?? true
  const showHero = source === 'all' && !member && !keyword && !feedQuery.trim()
  const highlight = useQuery({
    queryKey: ['updates-highlight', 1],
    queryFn: () => api<UpdateFeedItem | null>('/artists/1/updates/highlight'),
    enabled: showHero,
  })
  const heroItem = showHero ? highlight.data ?? selectHomeHeroItem(feedItems) : null
  const homeStyle = {
    '--accent': member ? memberColor(member, theme) : '',
    '--accent-on': member ? memberOn(member, theme) : '',
  } as CSSProperties
  return (
    <div className="homeStack" style={homeStyle}>
      {heroItem && <HomeHero item={heroItem} theme={theme} token={token} onOpenPost={onOpenPost} />}
      <section className="feedPanel">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">Live feed</p>
            <h2 className="serif">통합 업데이트</h2>
            <MemberSpectrum theme={theme} className="sectionSpectrum" />
            <p className="muted">YouTube, Naver, 오늘의 요약, 팬글을 시간순으로 모아 봅니다.</p>
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
                onClick={() => {
                  setSource(option.value)
                  trackAnalyticsEvent({
                    eventName: 'feed_filter_change',
                    panel: 'home',
                    token,
                    metadata: { filter: 'source', source: option.value },
                  })
                }}
              >
                {option.value !== 'all' && (
                  <span
                    className="srcDot"
                    style={{
                      background: (
                        {
                          youtube: '#d73535',
                          naver: '#1f8f54',
                          briefing: '#6b4fd8',
                          post: '#4d6a7a',
                        } as Record<string, string>
                      )[option.value],
                    }}
                  />
                )}
                {option.label}
              </button>
            ))}
          </div>
          <div className="memberPick" aria-label="member filter">
            <div className="memberPickHead">
              <span className="memberPickTitle serif">멤버별로 보기</span>
              <button
                type="button"
                className={!member ? 'memberAll active' : 'memberAll'}
                onClick={() => {
                  setMember('')
                  trackAnalyticsEvent({
                    eventName: 'feed_filter_change',
                    panel: 'home',
                    token,
                    metadata: { filter: 'member', member: 'all' },
                  })
                }}
              >
                전체
              </button>
            </div>
            <div className="memberTiles">
              {members.data?.map((item) => {
                const selected = member === item.name
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={['memberTile', selected ? 'active' : ''].filter(Boolean).join(' ')}
                    style={
                      {
                        '--mcol': memberColor(item.name, theme),
                        '--mon': memberOn(item.name, theme),
                      } as CSSProperties
                    }
                    onClick={() => {
                      const next = selected ? '' : item.name
                      setMember(next)
                      trackAnalyticsEvent({
                        eventName: 'feed_filter_change',
                        panel: 'home',
                        token,
                        metadata: { filter: 'member', member: next || 'all' },
                      })
                    }}
                  >
                    <span className="memberTileName">{memberLabel(item.name)}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="chipLine" aria-label="keyword filter">
            <button
              type="button"
              className={!keyword ? 'active' : ''}
              onClick={() => {
                setKeyword('')
                trackAnalyticsEvent({
                  eventName: 'feed_filter_change',
                  panel: 'home',
                  token,
                  metadata: { filter: 'keyword', keyword: 'all' },
                })
              }}
            >
              키워드 전체
            </button>
            {keywordOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={['tagChip', keyword === item ? 'active' : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  setKeyword(item)
                  trackAnalyticsEvent({
                    eventName: 'feed_filter_change',
                    panel: 'home',
                    token,
                    metadata: { filter: 'keyword', keyword: item },
                  })
                }}
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
        {saveError && <p className="error">{saveError}</p>}
        <div className="feedList">
          {feedItems.map((item) => {
            const savedItem = findSavedFeedItem(savedItems.data, item)
            const savePending = pendingSavedKeys.has(savedItem?.item_key ?? item.id)
            return (
              <UpdateFeedCard
                key={item.id}
                item={item}
                token={token}
                onOpenPost={onOpenPost}
                theme={theme}
                savedItem={savedItem}
                onToggleSave={() => {
                  if (!token) {
                    onRequireAuth()
                    return
                  }
                  if (!onRequireVerified()) return
                  if (savedItem) {
                    removeSavedItem.mutate(savedItem)
                    return
                  }
                  saveItem.mutate(item)
                }}
                savePending={savePending}
              />
            )
          })}
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
  token,
  onOpenPost,
  theme,
  savedItem,
  onToggleSave,
  savePending,
}: {
  item: UpdateFeedItem
  token: string | null
  onOpenPost: (postId: number) => void
  theme: Theme
  savedItem: SavedItem | null
  onToggleSave: () => void
  savePending: boolean
}) {
  const postId = postIdFromUrl(item.url)
  const isExternal = item.url.startsWith('http')
  const isYoutube = item.item_type === 'youtube'
  const isNote = item.item_type === 'briefing' || item.item_type === 'post'
  const primaryMember = item.member_names[0] ?? ''
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
  const isSaved = Boolean(savedItem)
  const cardStyle = {
    '--mcol': primaryMember ? memberColor(primaryMember, theme) : 'var(--border)',
  } as CSSProperties
  const body = (
    <>
      <div className="updateThumb">
        <span className={`typeBadge ${item.item_type}`}>{label}</span>
        {isNote ? (
          <div className="noteInner">
            <span>{label}</span>
            <strong className="serif">{item.title}</strong>
          </div>
        ) : item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : item.item_type === 'youtube' ? (
          <PlayCircle size={26} />
        ) : (
          <FileText size={24} />
        )}
      </div>
      <div className="updateBody">
        {!isNote && <strong>{item.title}</strong>}
        <div className="cardMembers">
          {item.member_names.slice(0, 5).map((name) => (
            <MemberAvatar key={name} name={name} theme={theme} size={22} />
          ))}
          <small>{item.member_names.length ? memberNamesText(item.member_names) : meta.source}</small>
        </div>
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
        </div>
      </div>
    </>
  )
  return (
    <article className={['updateCard', isNote ? 'noteCard' : ''].filter(Boolean).join(' ')} style={cardStyle}>
      {isExternal ? (
        <a
          className="updateMainLink"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            trackAnalyticsEvent({
              eventName: 'feed_card_open',
              panel: 'home',
              token,
              metadata: {
                item_type: item.item_type,
                item_key: item.id,
                title: item.title,
                source_label: item.source_label,
              },
            })
          }
        >
          {body}
          <ExternalLink className="sourceOpen" size={16} />
        </a>
      ) : (
        <button
          type="button"
          className="updateMainLink"
          onClick={() => {
            trackAnalyticsEvent({
              eventName: 'feed_card_open',
              panel: 'home',
              token,
              metadata: {
                item_type: item.item_type,
                item_key: item.id,
                title: item.title,
                source_label: item.source_label,
              },
            })
            if (postId) onOpenPost(postId)
          }}
          disabled={!postId}
        >
          {body}
        </button>
      )}
      <div className={isYoutube ? 'cardActions multi' : 'cardActions'}>
        {isYoutube && <YoutubeAppLink url={item.url} />}
        <button
          className={['saveButton', isSaved ? 'saved' : ''].filter(Boolean).join(' ')}
          onClick={onToggleSave}
          disabled={savePending}
          title={isSaved ? '저장됨 - 다시 누르면 해제' : '저장'}
          aria-pressed={isSaved}
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </article>
  )
}

function AuthModal({
  onClose,
}: {
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
        <AuthPanel />
      </div>
    </div>
  )
}

function AuthPanel() {
  const oauthStatus = useQuery({
    queryKey: ['oauth-status'],
    queryFn: () => api<OAuthStatus>('/auth/oauth/status'),
  })
  const oauthProviders = configuredOauthProviders(oauthStatus.data)
  return (
    <div className="authPanel socialAuthPanel">
      <div className="oauthButtonStack">
        {oauthProviders.map((provider) => (
          <button
            key={provider}
            type="button"
            className={`oauthButton oauthButton-${provider}`}
            onClick={() => {
              window.location.href = oauthStartUrl(provider, API_BASE)
            }}
          >
            <OAuthProviderIcon provider={provider} />
            <span>{oauthProviderLabels[provider]}</span>
          </button>
        ))}
      </div>
      {!oauthStatus.isLoading && oauthProviders.length === 0 && (
        <p className="hint">소셜 로그인은 관리자 설정 후 표시됩니다.</p>
      )}
    </div>
  )
}

function OAuthProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === 'google') {
    return (
      <span className="oauthIcon oauthIcon-google" aria-hidden="true">
        <svg viewBox="0 0 18 18" focusable="false">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26A5.43 5.43 0 0 1 3.96 10.7H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.96 10.7a5.39 5.39 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.08l3-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.66 8.66 0 0 0 9 0 9 9 0 0 0 .96 4.95l3 2.33A5.36 5.36 0 0 1 9 3.58Z"
          />
        </svg>
      </span>
    )
  }
  if (provider === 'kakao') {
    return (
      <span className="oauthIcon oauthIcon-kakao" aria-hidden="true">
        <svg viewBox="0 0 20 20" focusable="false">
          <path d="M10 3.2c-4.2 0-7.6 2.66-7.6 5.94 0 2.13 1.43 4 3.58 5.05l-.72 2.63c-.07.24.2.43.4.28l3.13-2.08c.4.04.8.06 1.21.06 4.2 0 7.6-2.66 7.6-5.94S14.2 3.2 10 3.2Z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="oauthIcon oauthIcon-naver" aria-hidden="true">
      N
    </span>
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
  theme,
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
  theme: Theme
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
        theme={theme}
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
  theme,
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
  theme: Theme
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
            <CategoryBadge category={post.category} theme={theme} className="boardCategory" />
            <span className="boardTitleCell">
              <strong>{post.title}</strong>
              <span className="boardMobileMeta">
                <CategoryBadge category={post.category} theme={theme} className="boardCategory mobileCategory" />
                <span>{post.author.display_name}</span>
                <span>댓글 {post.comment_count}</span>
                <span>{formatDate(post.created_at)}</span>
              </span>
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
  theme,
  onRequireAuth,
  onRequireVerified,
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
  theme: Theme
  onRequireAuth: () => void
  onRequireVerified: () => boolean
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
  const lastWritingAssistQuery = useRef('')
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
      trackAnalyticsEvent({
        eventName: 'post_create',
        panel: 'board',
        token,
        metadata: { post_id: createdPost.id, title: createdPost.title },
      })
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
      trackAnalyticsEvent({
        eventName: 'comment_create',
        panel: 'board',
        token,
        metadata: { post_id: post?.id ?? 0 },
      })
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['comments', post?.id] })
      onChanged()
    },
  })
  const writingAssist = useMutation({
    mutationFn: () =>
      api<RagContextResponse>(
        '/ai/writing-assist',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            content,
            category,
            artist_id: 1,
            limit: 5,
          }),
        },
        token,
      ),
  })
  const writingAssistQuery = buildWritingAssistQuery(category, title, content)
  const writingAssistReady = shouldRequestWritingAssist(writingAssistQuery)
  useEffect(() => {
    if (mode !== 'write' || !token || !user || !writingAssistReady) return
    if (lastWritingAssistQuery.current === writingAssistQuery) return
    const timer = window.setTimeout(() => {
      lastWritingAssistQuery.current = writingAssistQuery
      writingAssist.mutate()
    }, 700)
    return () => window.clearTimeout(timer)
  }, [mode, token, user, writingAssistReady, writingAssistQuery])
  const shouldRenderBriefing = post ? shouldUseBriefingContent(post.category, post.content) : false
  const parsedBriefing = useMemo(
    () => (post && shouldRenderBriefing ? parseBriefingContent(post.content) : null),
    [post?.content, post?.category, shouldRenderBriefing],
  )

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
        theme={theme}
        onSearchChange={onSearchChange}
        onTagChange={onTagChange}
        onSelect={onSelectPost}
        onPageChange={onPageChange}
        onWrite={() => {
          if (!onRequireVerified()) return
          onStartWrite()
        }}
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
          if (!onRequireVerified()) return
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
        <WritingAssistPanel
          ready={writingAssistReady}
          loading={writingAssist.isPending}
          result={writingAssist.data ?? null}
          error={writingAssist.error?.message ?? ''}
          onRefresh={() => {
            if (!onRequireVerified()) return
            lastWritingAssistQuery.current = writingAssistQuery
            writingAssist.mutate()
          }}
          onInsert={(source) => setContent((current) => appendReferenceText(current, source))}
          onOpenPost={onSelectPost}
        />
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
          <CategoryBadge category={post.category} theme={theme} />
          <h2>{post.title}</h2>
          <div className="postMeta">
            <span>{post.author.display_name}</span>
            <span>{formatDate(post.created_at)}</span>
            <span>댓글 {post.comment_count}</span>
          </div>
        </div>
      </div>
      {parsedBriefing ? (
        <BriefingContent
          text={post.content}
          parsed={parsedBriefing}
          embeds={post.embeds}
          onOpenPost={onSelectPost}
        />
      ) : (
        <LinkedText className="postContent" text={post.content} />
      )}
      {!parsedBriefing && post.embeds.length > 0 && <EmbedList embeds={post.embeds} onOpenPost={() => undefined} />}
      <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      {deletePost.error && <p className="error">{deletePost.error.message}</p>}
      <section className="comments" aria-label="댓글">
        <div className="commentsHead">
          <strong>댓글</strong>
          <span>{formatNumber(comments.data?.length ?? post.comment_count)}</span>
        </div>
        {comments.data?.map((item) => (
          <article className="commentItem" key={item.id}>
            <div>
              <strong>{item.author.display_name}</strong>
              <span>{formatDateTime(item.created_at)}</span>
            </div>
            <p>{item.content}</p>
          </article>
        ))}
      </section>
      {user ? (
        <form
          className="inlineForm"
          onSubmit={(event) => {
            event.preventDefault()
            if (!onRequireVerified()) return
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

function isYoutubeBriefingUrl(url: string) {
  return /(?:youtube\.com|youtu\.be)/i.test(url)
}

function BriefingLinkCard({
  item,
  embed,
  onOpenPost,
}: {
  item: Extract<BriefingContentItem, { type: 'link' }>
  embed?: PostEmbed | null
  onOpenPost: (postId: number) => void
}) {
  if (embed) {
    return <EmbedCard embed={embed} onOpenPost={onOpenPost} />
  }
  const isYoutube = isYoutubeBriefingUrl(item.url)
  const postId = postIdFromUrl(item.url)
  if (postId) {
    return (
      <button className="sourceCard briefingLinkCard" type="button" onClick={() => onOpenPost(postId)}>
        <span className="sourceType">팬글</span>
        <strong>{item.title}</strong>
        <span className="briefingOpen">
          게시글 보기
          <ExternalLink size={14} />
        </span>
      </button>
    )
  }
  return (
    <a className="sourceCard briefingLinkCard" href={item.url} target="_blank" rel="noreferrer">
      <span className="sourceType">{isYoutube ? 'YouTube' : 'Source'}</span>
      <strong>{item.title}</strong>
      <span className="briefingOpen">
        {isYoutube && <PlayCircle size={15} />}
        원문 보기
        <ExternalLink size={14} />
      </span>
    </a>
  )
}

function BriefingSectionItems({
  items,
  embeds,
  onOpenPost,
}: {
  items: BriefingContentItem[]
  embeds?: PostEmbed[]
  onOpenPost: (postId: number) => void
}) {
  const nodes: ReactNode[] = []
  let bulletBuffer: string[] = []
  const flushBullets = () => {
    if (bulletBuffer.length === 0) return
    const bullets = bulletBuffer
    bulletBuffer = []
    nodes.push(
      <ul className="briefingList" key={`bullets-${nodes.length}`}>
        {bullets.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>,
    )
  }

  items.forEach((item, index) => {
    if (item.type === 'bullet') {
      bulletBuffer.push(item.text)
      return
    }
    flushBullets()
    if (item.type === 'link') {
      nodes.push(
        <BriefingLinkCard
          key={`${item.url}-${index}`}
          item={item}
          embed={findBriefingEmbedForLink(embeds, item)}
          onOpenPost={onOpenPost}
        />,
      )
      return
    }
    nodes.push(
      <p className="briefingText" key={`${item.text}-${index}`}>
        {item.text}
      </p>,
    )
  })
  flushBullets()
  return <>{nodes}</>
}

function BriefingContent({
  text,
  parsed,
  embeds,
  onOpenPost = () => undefined,
}: {
  text: string
  parsed?: ParsedBriefingContent | null
  embeds?: PostEmbed[]
  onOpenPost?: (postId: number) => void
}) {
  const content = parsed ?? parseBriefingContent(text)
  if (!content) return <LinkedText className="postContent" text={text} />
  return (
    <div className="postContent briefingContent">
      {content.dateLine && <p className="briefingDate">{content.dateLine}</p>}
      {content.sections.map((section) => (
        <section className="briefingSection" key={section.heading}>
          <h3 className="serif">{section.heading}</h3>
          <BriefingSectionItems items={section.items} embeds={embeds} onOpenPost={onOpenPost} />
        </section>
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
  onRequireVerified,
  onOpenPost,
}: {
  token: string | null
  selectedPost: Post | null
  onRequireAuth: () => void
  onRequireVerified: () => boolean
  onOpenPost: (postId: number) => void
}) {
  const [question, setQuestion] = useState('')
  const [qaResult, setQaResult] = useState<QaResponse | null>(null)
  const qa = useMutation({
    mutationFn: (payload: { offset: number; includeAnswer: boolean }) =>
      api<QaResponse>(
        '/ai/qa',
        {
          method: 'POST',
          body: JSON.stringify({
            question,
            artist_id: 1,
            limit: 10,
            offset: payload.offset,
            include_answer: payload.includeAnswer,
          }),
        },
        token,
      ),
    onSuccess: (data, payload) => {
      if (payload.offset === 0) {
        setQaResult(data)
        return
      }
      setQaResult((current) => ({
        answer: current?.answer ?? data.answer,
        sources: [...(current?.sources ?? []), ...data.sources],
        has_more: data.has_more,
        next_offset: data.next_offset,
      }))
    },
  })
  const similar = useMutation({
    mutationFn: () =>
      api<Post[]>('/ai/similar', { method: 'POST', body: JSON.stringify({ post_id: selectedPost?.id }) }, token),
  })
  return (
    <div className="stack">
      <form
        className="qaBox archiveSearchCard"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token) {
            onRequireAuth()
            return
          }
          if (!onRequireVerified()) return
          setQaResult(null)
          trackAnalyticsEvent({
            eventName: 'archive_search_submit',
            panel: 'rag',
            token,
            metadata: { query: question, limit: 10, offset: 0 },
          })
          qa.mutate({ offset: 0, includeAnswer: true })
        }}
      >
        <div>
          <p className="eyebrow">Archive search</p>
          <h2 className="serif">리센느 자료 검색</h2>
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
      {qaResult && (
        <section className="answer archiveResults">
          <h2>검색 결과</h2>
          {qaResult.answer && <ArchiveAnswerBlock answer={qaResult.answer} />}
          <div className="sourceCards">
            {qaResult.sources.map((source, index) => (
              <SourceCard
                key={`${source.source_type}-${source.chunk_id}-${index}`}
                source={source}
                onOpenPost={onOpenPost}
              />
            ))}
          </div>
          {qaResult.has_more && (
            <button
              className="secondary"
              disabled={qa.isPending}
              onClick={() => {
                const offset = qaResult.next_offset ?? qaResult.sources.length
                trackAnalyticsEvent({
                  eventName: 'archive_search_load_more',
                  panel: 'rag',
                  token,
                  metadata: { query: question, limit: 10, offset },
                })
                qa.mutate({ offset, includeAnswer: false })
              }}
            >
              더 보기
            </button>
          )}
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
          if (!onRequireVerified()) return
          similar.mutate()
        }}
      >
        유사 글
      </button>
      {similar.data?.map((post) => <p key={post.id}>{post.title}</p>)}
    </div>
  )
}

function WritingAssistPanel({
  ready,
  loading,
  result,
  error,
  onRefresh,
  onInsert,
  onOpenPost,
}: {
  ready: boolean
  loading: boolean
  result: RagContextResponse | null
  error: string
  onRefresh: () => void
  onInsert: (source: QaSource) => void
  onOpenPost: (postId: number) => void
}) {
  return (
    <section className="ragContextPanel">
      <div className="ragContextHead">
        <div>
          <p className="eyebrow">RAG Assist</p>
          <h3>관련 자료</h3>
        </div>
        <button type="button" className="secondary" disabled={!ready || loading} onClick={onRefresh}>
          <RefreshCw size={16} />
          새로고침
        </button>
      </div>
      {!ready && <p className="hint">제목이나 본문을 8자 이상 입력하면 관련 자료를 추천합니다.</p>}
      {loading && <p className="muted">관련 자료를 찾는 중...</p>}
      {error && <p className="error">{error}</p>}
      {result?.summary && <p className="hint">{result.summary}</p>}
      {result?.sources.length ? (
        <div className="sourceCards compactSourceCards">
          {result.sources.map((source, index) => (
            <div className="assistSource" key={`${source.source_type}-${source.url}-${index}`}>
              <SourceCard source={source} onOpenPost={onOpenPost} />
              <button type="button" className="secondary" disabled={!source.url} onClick={() => onInsert(source)}>
                <Save size={16} />
                본문에 추가
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
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
  const isYoutube = source.source_type === 'youtube'
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
      <article className={isYoutube ? 'sourceCard sourceCardShell sourceCardWithActions' : 'sourceCard sourceCardShell'}>
        <a className="sourceMainLink" href={source.url} target="_blank" rel="noreferrer">
          {body}
          <ExternalLink className="sourceOpen" size={16} />
        </a>
        {isYoutube && <YoutubeAppLink url={source.url} className="youtubeAppButton sourceAppButton" />}
      </article>
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

function YoutubePanel({ token, user, theme }: { token: string | null; user?: User; theme: Theme }) {
  const queryClient = useQueryClient()
  const [videoSort, setVideoSort] = useState<VideoSort>('latest')
  const [visibleCount, setVisibleCount] = useState(VIDEO_RENDER_STEP)
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
  const [backfillResult, setBackfillResult] = useState<YoutubeBackfillResult | null>(null)
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
  const backfill = useMutation({
    mutationFn: () =>
      api<YoutubeBackfillResult>(
        '/artists/1/youtube-backfill',
        {
          method: 'POST',
          body: JSON.stringify({ pages_per_source: 20, metadata_only: true }),
        },
        token,
      ),
    onSuccess: (result) => {
      setBackfillResult(result)
      void queryClient.invalidateQueries({ queryKey: ['videos', 1] })
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
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
  const visibleVideos = sortedVideos.slice(0, visibleCount)
  const changeVideoSort = (nextSort: VideoSort) => {
    setVideoSort(nextSort)
    setVisibleCount(VIDEO_RENDER_STEP)
  }
  return (
    <div className="stack youtubePanel">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">YouTube</p>
          <h2 className="serif">영상 모아보기</h2>
        </div>
        <span className="feedCount">
          {videos.isLoading ? '불러오는 중...' : `${formatNumber(videos.data?.length ?? 0)} videos`}
        </span>
      </div>
      <div className="videoToolbar">
        <div className="sortGroup">
          <button className={videoSort === 'latest' ? 'active' : ''} onClick={() => changeVideoSort('latest')}>
            최신순
          </button>
          <button className={videoSort === 'views' ? 'active' : ''} onClick={() => changeVideoSort('views')}>
            조회수
          </button>
          <button className={videoSort === 'title' ? 'active' : ''} onClick={() => changeVideoSort('title')}>
            제목
          </button>
        </div>
      </div>
      {videos.isLoading ? (
        <p className="muted">영상을 불러오는 중...</p>
      ) : (
        <>
          <div className="videoGrid">
            {visibleVideos.map((video) => {
              const members = memberNamesFromText(video.title, video.channel_title, video.description)
              const cardStyle = {
                '--mcol': members[0] ? memberColor(members[0], theme) : 'var(--border)',
              } as CSSProperties
              return (
                <article key={video.id} className="updateCard videoPoster" style={cardStyle}>
                  <a className="updateMainLink videoMainLink" href={video.url} target="_blank" rel="noreferrer">
                    <div className="videoThumb">
                      <span className="typeBadge youtube">YouTube</span>
                      {video.thumbnail_url ? (
                        <img src={video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <PlayCircle size={28} />
                      )}
                    </div>
                    <div className="videoBody">
                      <strong>{video.title}</strong>
                      <div className="cardMembers">
                        {members.slice(0, 5).map((name) => (
                          <MemberAvatar key={name} name={name} theme={theme} size={22} />
                        ))}
                        <small>{members.length ? compactMemberNamesText(members) : video.channel_title}</small>
                      </div>
                      <span className="videoStats">
                        <span>
                          <Eye size={14} />
                          {formatNumber(video.view_count)}
                        </span>
                        <span>
                          <CalendarDays size={14} />
                          {formatDate(video.published_at)}
                        </span>
                      </span>
                    </div>
                  </a>
                  <div className="cardActions">
                    <YoutubeAppLink url={video.url} />
                  </div>
                </article>
              )
            })}
          </div>
          {!videos.data?.length && <p className="muted">No cached videos yet.</p>}
          {visibleCount < sortedVideos.length && (
            <button className="loadMore" onClick={() => setVisibleCount((current) => current + VIDEO_RENDER_STEP)}>
              더 보기
            </button>
          )}
        </>
      )}
      {user?.role === 'admin' && (
        <details className="adminTools">
          <summary>
            <span>관리 도구</span>
            <small>Sync, Backfill, source management</small>
          </summary>
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
            <button
              type="button"
              className="secondary"
              onClick={() => backfill.mutate()}
              disabled={backfill.isPending}
              title="데뷔일부터 과거 YouTube 자료 가져오기"
            >
              <RefreshCw size={17} />
              Backfill
            </button>
          </form>
          {addSource.error && <p className="error">{addSource.error.message}</p>}
          {sync.error && <p className="error">{sync.error.message}</p>}
          {backfill.error && <p className="error">{backfill.error.message}</p>}
          {backfillResult && (
            <p className="hint">
              Backfill: {formatNumber(backfillResult.created)} new, {formatNumber(backfillResult.updated)} updated,
              {` ${formatNumber(backfillResult.pages_fetched)} pages`}
              {backfillResult.has_more ? ' · 더 가져올 수 있음' : ' · 완료'}
            </p>
          )}
          <div className="sourceList">
            {sources.data?.map((source) => (
              <span key={source.id}>
                {source.title}
                {source.backfill_status && source.backfill_status !== 'idle' && (
                  <em>{source.backfill_status}</em>
                )}
                <button
                  className="chipButton"
                  onClick={() => deleteSource.mutate(source.id)}
                  disabled={deleteSource.isPending}
                  title="소스 삭제"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        </details>
      )}
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
  theme,
  onRequireAuth,
  onOpenPost,
}: {
  token: string | null
  user?: User
  theme: Theme
  onRequireAuth: () => void
  onOpenPost: (postId: number) => void
}) {
  const queryClient = useQueryClient()
  const [pendingRemoveKeys, setPendingRemoveKeys] = useState<Set<string>>(() => new Set())
  const [removeError, setRemoveError] = useState('')
  const savedItemsQueryKey = ['saved-items', token] as const
  const savedItems = useQuery({
    queryKey: savedItemsQueryKey,
    queryFn: () => api<SavedItem[]>('/saved-items', {}, token),
    enabled: Boolean(token && user),
  })
  const savedSummary = useMutation({
    mutationFn: () =>
      api<RagContextResponse>(
        '/ai/saved-summary',
        {
          method: 'POST',
          body: JSON.stringify({ artist_id: 1, limit: 5 }),
        },
        token,
      ),
  })
  const remove = useMutation({
    mutationFn: (item: SavedItem) => api<void>(`/saved-items/${item.id}`, { method: 'DELETE' }, token),
    onMutate: async (item) => {
      setRemoveError('')
      setPendingRemoveKeys((current) => new Set(current).add(item.item_key))
      await queryClient.cancelQueries({ queryKey: savedItemsQueryKey })
      const previousItems = queryClient.getQueryData<SavedItem[]>(savedItemsQueryKey)
      queryClient.setQueryData<SavedItem[]>(savedItemsQueryKey, (current) => removeSavedItemFromList(current, item))
      return { previousItems, item }
    },
    onError: (_error, _item, context) => {
      queryClient.setQueryData(savedItemsQueryKey, context?.previousItems)
      setRemoveError('저장 항목 삭제에 실패했습니다. 다시 시도해 주세요.')
    },
    onSettled: (_data, _error, item, context) => {
      const itemKey = context?.item.item_key ?? item?.item_key
      if (!itemKey) return
      setPendingRemoveKeys((current) => {
        const next = new Set(current)
        next.delete(itemKey)
        return next
      })
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
    <div className="stack savedPanel">
      <div className="sectionHead">
        <div>
          <p className="eyebrow">Saved</p>
          <h2>저장한 자료</h2>
        </div>
        <span className="feedCount">{formatNumber(savedItems.data?.length ?? 0)} items</span>
      </div>
      {savedItems.isLoading && <p className="muted">저장 항목을 불러오는 중...</p>}
      {savedItems.error && <p className="error">{savedItems.error.message}</p>}
      {removeError && <p className="error">{removeError}</p>}
      <section className="ragContextPanel savedSummaryPanel">
        <div className="ragContextHead">
          <div>
            <p className="eyebrow">Personal RAG</p>
            <h3>저장한 자료 요약</h3>
          </div>
          <div className="inlineActions">
            <button
              type="button"
              className="secondary"
              disabled={!canSummarizeSavedItems(savedItems.data) || savedSummary.isPending}
              onClick={() => savedSummary.mutate()}
            >
              <Send size={16} />
              요약 생성
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canSummarizeSavedItems(savedItems.data) || savedSummary.isPending}
              onClick={() => savedSummary.mutate()}
            >
              <Search size={16} />
              관련 자료 더 찾기
            </button>
          </div>
        </div>
        {!canSummarizeSavedItems(savedItems.data) && (
          <p className="hint">저장한 자료가 생기면 개인 요약과 관련 아카이브를 볼 수 있습니다.</p>
        )}
        {savedSummary.isPending && <p className="muted">저장한 자료를 요약하는 중...</p>}
        {savedSummary.error && <p className="error">{savedSummary.error.message}</p>}
        {savedSummary.data?.summary && <p className="hint">{savedSummary.data.summary}</p>}
        {savedSummary.data?.sources.length ? (
          <div className="sourceCards compactSourceCards">
            {savedSummary.data.sources.map((source, index) => (
              <SourceCard
                key={`${source.source_type}-${source.url}-${index}`}
                source={source}
                onOpenPost={onOpenPost}
              />
            ))}
          </div>
        ) : null}
      </section>
      <div className="feedList savedGrid">
        {savedItems.data?.map((item) => {
          const postId = postIdFromUrl(item.url)
          const isExternal = item.url.startsWith('http')
          const isYoutube = item.item_type === 'youtube'
          const members = memberNamesFromText(item.title, item.source_label)
          const cardStyle = {
            '--mcol': members[0] ? memberColor(members[0], theme) : 'var(--border)',
          } as CSSProperties
          return (
            <article className="updateCard" key={item.id} style={cardStyle}>
              {isExternal ? (
                <a className="updateMainLink" href={item.url} target="_blank" rel="noreferrer">
                  <SavedItemBody item={item} members={members} theme={theme} />
                  <ExternalLink className="sourceOpen" size={16} />
                </a>
              ) : (
                <button
                  className="updateMainLink"
                  onClick={() => postId && onOpenPost(postId)}
                  disabled={!postId}
                >
                  <SavedItemBody item={item} members={members} theme={theme} />
                </button>
              )}
              <div className={isYoutube ? 'cardActions multi' : 'cardActions'}>
                {isYoutube && <YoutubeAppLink url={item.url} />}
                <button
                  className="saveButton"
                  onClick={() => remove.mutate(item)}
                  disabled={pendingRemoveKeys.has(item.item_key)}
                  title="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>
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

function savedItemTypeLabel(item: SavedItem) {
  if (item.item_type === 'youtube') return 'YouTube'
  if (item.item_type === 'briefing') return '오늘의 요약'
  if (item.item_type === 'naver_blog') return 'Naver Blog'
  if (item.item_type === 'naver_news') return 'Naver News'
  if (item.item_type === 'post') return '팬글'
  return item.source_label || item.item_type
}

function SavedItemBody({ item, members, theme }: { item: SavedItem; members: string[]; theme: Theme }) {
  const label = savedItemTypeLabel(item)
  return (
    <>
      <div className="updateThumb">
        <span className={`typeBadge ${item.item_type}`}>{label}</span>
        {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" /> : <Bookmark size={24} />}
      </div>
      <div className="updateBody">
        <div className="updateMeta">
          <span>{formatDateTime(item.saved_at)}</span>
        </div>
        <strong>{item.title}</strong>
        <div className="cardMembers">
          {members.slice(0, 5).map((name) => (
            <MemberAvatar key={name} name={name} theme={theme} size={22} />
          ))}
          <small>{members.length ? memberNamesText(members) : item.source_label || label}</small>
        </div>
      </div>
    </>
  )
}

function AnalyticsList({
  title,
  rows,
}: {
  title: string
  rows?: { label: string; count: number }[]
}) {
  return (
    <div className="analyticsList">
      <strong>{title}</strong>
      {rows?.length ? (
        rows.map((row) => (
          <span key={`${title}-${row.label}`}>
            <em>{row.label}</em>
            <small>{formatNumber(row.count)}</small>
          </span>
        ))
      ) : (
        <p className="muted">아직 데이터가 없습니다.</p>
      )}
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
  const youtubeSources = useQuery({
    queryKey: ['sources', 1],
    queryFn: () => api<YoutubeSource[]>('/artists/1/youtube-sources'),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const adminUsers = useQuery({
    queryKey: ['admin-users', token],
    queryFn: () => api<User[]>('/admin/users', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const ragCoverage = useQuery({
    queryKey: ['rag-coverage', token],
    queryFn: () => api<RagCoverage>('/admin/rag/coverage', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const ragJob = useQuery({
    queryKey: ['rag-job-current', token],
    queryFn: () => api<RagEmbeddingJob | null>('/admin/rag/jobs/current', {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const [analyticsDays, setAnalyticsDays] = useState<1 | 7 | 30>(7)
  const analyticsSummary = useQuery({
    queryKey: ['analytics-summary', token, analyticsDays],
    queryFn: () => api<AnalyticsSummary>(adminActivitySummaryPath(analyticsDays), {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const analyticsEvents = useQuery({
    queryKey: ['analytics-events', token, analyticsDays],
    queryFn: () => api<AnalyticsEvent[]>(adminActivityEventsPath(analyticsDays, 30), {}, token),
    enabled: Boolean(token && user?.role === 'admin'),
  })
  const [form, setForm] = useState<InfraCostSettings | null>(null)
  const [syncForm, setSyncForm] = useState<SyncSettings | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [termType, setTermType] = useState<ArtistArchiveTerm['term_type']>('song')
  const [termTitle, setTermTitle] = useState('')
  const [termAliases, setTermAliases] = useState('')
  const [editingTermId, setEditingTermId] = useState<number | null>(null)
  const [adminSourceType, setAdminSourceType] = useState<YoutubeSourceType>('keyword_search')
  const [adminSourceTitle, setAdminSourceTitle] = useState('')
  const [adminSourceValue, setAdminSourceValue] = useState('')
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole, setUserRole] = useState<User['role']>('user')
  const [ragActionResult, setRagActionResult] = useState<string | null>(null)
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
  const addYoutubeSource = useMutation({
    mutationFn: () =>
      api<YoutubeSource>(
        '/artists/1/youtube-sources',
        {
          method: 'POST',
          body: JSON.stringify(
            buildYoutubeSourcePayload({
              sourceType: adminSourceType,
              sourceTitle: adminSourceTitle,
              sourceValue: adminSourceValue,
            }),
          ),
        },
        token,
      ),
    onSuccess: () => {
      setAdminSourceTitle('')
      setAdminSourceValue('')
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
  const deleteYoutubeSource = useMutation({
    mutationFn: (sourceId: number) => api<void>(`/youtube-sources/${sourceId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources', 1] })
      void queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
  const resetUserForm = () => {
    setEditingUserId(null)
    setUserEmail('')
    setUserDisplayName('')
    setUserPassword('')
    setUserRole('user')
  }
  const saveUser = useMutation({
    mutationFn: () => {
      const payload = {
        email: userEmail,
        display_name: userDisplayName,
        role: userRole,
        ...(userPassword.trim() ? { password: userPassword } : {}),
      }
      return api<User>(
        editingUserId ? `/admin/users/${editingUserId}` : '/admin/users',
        {
          method: editingUserId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
        token,
      )
    },
    onSuccess: () => {
      resetUserForm()
      void queryClient.invalidateQueries({ queryKey: ['admin-users', token] })
      void queryClient.invalidateQueries({ queryKey: ['me', token] })
    },
  })
  const deleteUser = useMutation({
    mutationFn: (userId: number) => api<void>(`/admin/users/${userId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users', token] })
    },
  })
  const revokeUserSessions = useMutation({
    mutationFn: (userId: number) => api<{ revoked: number }>(`/admin/users/${userId}/sessions`, { method: 'DELETE' }, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users', token] })
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
  const cleanupRag = useMutation({
    mutationFn: () =>
      api<RagCleanupResult>(
        '/admin/rag/cleanup',
        {
          method: 'POST',
          body: JSON.stringify({ artist_id: 1 }),
        },
        token,
      ),
    onSuccess: (data) => {
      setRagActionResult(
        `정리 완료: stale ${formatNumber(data.stale_deleted)}, orphan ${formatNumber(
          data.orphan_deleted,
        )}, duplicate ${formatNumber(data.duplicate_deleted)}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['rag-coverage', token] })
    },
  })
  const startRagJob = useMutation({
    mutationFn: (payload: { scope: 'recent_90d' | 'all' }) =>
      api<RagEmbeddingJob>(
        '/admin/rag/jobs',
        {
          method: 'POST',
          body: JSON.stringify({
            artist_id: 1,
            scope: payload.scope,
            batch_size: 64,
            force: false,
          }),
        },
        token,
      ),
    onSuccess: (data) => {
      setRagActionResult(
        `작업 생성: ${formatNumber(data.embedded)}개 처리, 남은 후보 ${formatNumber(data.remaining_missing)}`,
      )
      queryClient.setQueryData(['rag-job-current', token], data)
      void queryClient.invalidateQueries({ queryKey: ['rag-coverage', token] })
    },
  })
  const runRagJob = useMutation({
    mutationFn: (jobId: number) =>
      api<RagEmbeddingJob>(`/admin/rag/jobs/${jobId}/run`, { method: 'POST' }, token),
    onSuccess: (data) => {
      setRagActionResult(
        `배치 처리: 누적 ${formatNumber(data.embedded)}개, 남은 후보 ${formatNumber(data.remaining_missing)}`,
      )
      queryClient.setQueryData(['rag-job-current', token], data)
      void queryClient.invalidateQueries({ queryKey: ['rag-coverage', token] })
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
  const currentRagJob = ragJob.data
  const selectedAdminSourceOption = youtubeSourceOptions.find((option) => option.value === adminSourceType)
  const keywordSearchSources = (youtubeSources.data ?? []).filter((source) => source.source_type === 'keyword_search')
  const userPasswordRules = getPasswordRuleStatus(userPassword)
  const userPasswordAllowed =
    userPassword.length === 0
      ? Boolean(editingUserId)
      : isStrongPassword(userPassword)
  return (
    <div className="stack">
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>Analytics</h2>
            <p className="muted">익명 세션 기준 방문, 검색, 저장, 게시판 활동을 확인합니다.</p>
          </div>
          <div className="segmented compactSegmented">
            {[1, 7, 30].map((days) => (
              <button
                key={days}
                type="button"
                className={analyticsDays === days ? 'active' : ''}
                onClick={() => setAnalyticsDays(days as 1 | 7 | 30)}
              >
                {days === 1 ? '오늘' : `${days}일`}
              </button>
            ))}
          </div>
        </div>
        <div className="budgetStats">
          <span>Today visitors {formatNumber(analyticsSummary.data?.today_visitors)}</span>
          <span>{analyticsDays}d visitors {formatNumber(analyticsSummary.data?.visitors)}</span>
          <span>Logged-in users {formatNumber(analyticsSummary.data?.logged_in_users)}</span>
          <span>Events {formatNumber(analyticsSummary.data?.events)}</span>
          <span>Searches {formatNumber(analyticsSummary.data?.searches)}</span>
          <span>Saves {formatNumber(analyticsSummary.data?.saves)}</span>
          <span>Posts {formatNumber(analyticsSummary.data?.posts)}</span>
          <span>Comments {formatNumber(analyticsSummary.data?.comments)}</span>
          <span>AI questions {formatNumber(analyticsSummary.data?.ai_questions)}</span>
        </div>
        <div className="analyticsGrid">
          <AnalyticsList
            title="인기 검색어"
            rows={analyticsSummary.data?.popular_queries.map((item) => ({
              label: item.query,
              count: item.count,
            }))}
          />
          <AnalyticsList
            title="많이 열린 자료"
            rows={analyticsSummary.data?.popular_cards.map((item) => ({
              label: item.title,
              count: item.count,
            }))}
          />
          <AnalyticsList title="많이 쓰는 화면" rows={analyticsSummary.data?.popular_panels} />
        </div>
        <div className="adminTable">
          <div className="adminTableHead">
            <span>최근 이벤트</span>
            <span>화면</span>
            <span>시간</span>
          </div>
          {analyticsEvents.data?.map((event) => (
            <div key={event.id} className="adminTableRow">
              <span>{event.event_name}</span>
              <span>{event.panel || event.path || '-'}</span>
              <span>{formatDateTime(event.created_at)}</span>
            </div>
          ))}
        </div>
        {analyticsSummary.error && <p className="error">{analyticsSummary.error.message}</p>}
        {analyticsEvents.error && <p className="error">{analyticsEvents.error.message}</p>}
      </section>
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>회원 관리</h2>
            <p className="muted">회원가입 차단 상태와 별개로 관리자가 계정을 추가, 수정, 삭제합니다.</p>
          </div>
          <span className="role">{formatNumber(adminUsers.data?.length)} users</span>
        </div>
        <form
          className="budgetForm"
          onSubmit={(event) => {
            event.preventDefault()
            saveUser.mutate()
          }}
        >
          <label>
            이메일
            <input
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <label>
            표시 이름
            <input
              value={userDisplayName}
              onChange={(event) => setUserDisplayName(event.target.value)}
              placeholder="표시 이름"
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={userPassword}
              onChange={(event) => setUserPassword(event.target.value)}
              placeholder={editingUserId ? '변경 시에만 입력' : passwordRequirementText}
              maxLength={72}
            />
          </label>
          {userPassword.length > 0 && (
            <div className="passwordRules" aria-label="비밀번호 규칙">
              {userPasswordRules.map((rule) => (
                <span key={rule.id} className={rule.valid ? 'valid' : ''}>
                  {rule.label}
                </span>
              ))}
            </div>
          )}
          <label>
            권한
            <select value={userRole} onChange={(event) => setUserRole(event.target.value as User['role'])}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={
              !userEmail.trim() ||
              !userDisplayName.trim() ||
              !userPasswordAllowed ||
              saveUser.isPending
            }
          >
            <Save size={17} />
            {editingUserId ? '수정' : '추가'}
          </button>
          {editingUserId && (
            <button type="button" className="secondary" onClick={resetUserForm}>
              취소
            </button>
          )}
        </form>
        <div className="sourceList archiveTermList">
          {adminUsers.data?.map((item) => (
            <span key={item.id}>
              <strong>{item.role}</strong>
              {item.email}
              <em>{item.display_name}</em>
              <em>{item.email_verified_at ? 'verified' : 'unverified'}</em>
              <em>{formatNumber(item.active_session_count ?? 0)} sessions</em>
              <button
                className="chipButton"
                onClick={() => {
                  setEditingUserId(item.id)
                  setUserEmail(item.email)
                  setUserDisplayName(item.display_name)
                  setUserPassword('')
                  setUserRole(item.role)
                }}
                title="계정 수정"
              >
                <Edit3 size={13} />
              </button>
              <button
                className="chipButton"
                onClick={() => revokeUserSessions.mutate(item.id)}
                disabled={revokeUserSessions.isPending || (item.active_session_count ?? 0) === 0}
                title="세션 모두 만료"
              >
                <LogOut size={13} />
              </button>
              <button
                className="chipButton"
                onClick={() => deleteUser.mutate(item.id)}
                disabled={deleteUser.isPending || item.id === user.id}
                title={item.id === user.id ? '본인 계정은 삭제할 수 없음' : '계정 삭제'}
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
        {adminUsers.error && <p className="error">{adminUsers.error.message}</p>}
        {saveUser.error && <p className="error">{saveUser.error.message}</p>}
        {deleteUser.error && <p className="error">{deleteUser.error.message}</p>}
        {revokeUserSessions.error && <p className="error">{revokeUserSessions.error.message}</p>}
      </section>
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
            <h2>YouTube search sources</h2>
            <p className="muted">YouTube 자동 수집에 사용할 채널, 단일 영상, 키워드 검색 쿼리를 관리합니다.</p>
          </div>
          <span className="role">{formatNumber(keywordSearchSources.length)} keyword queries</span>
        </div>
        <form
          className="budgetForm"
          onSubmit={(event) => {
            event.preventDefault()
            addYoutubeSource.mutate()
          }}
        >
          <label>
            Source type
            <select
              value={adminSourceType}
              onChange={(event) => setAdminSourceType(event.target.value as YoutubeSourceType)}
            >
              {youtubeSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            관리 이름
            <input
              value={adminSourceTitle}
              onChange={(event) => setAdminSourceTitle(event.target.value)}
              placeholder={adminSourceType === 'keyword_search' ? '비워두면 검색어로 자동 생성' : '소스 이름'}
            />
          </label>
          <label>
            검색어 또는 ID
            <input
              value={adminSourceValue}
              onChange={(event) => setAdminSourceValue(event.target.value)}
              placeholder={selectedAdminSourceOption?.placeholder ?? 'YouTube 검색어, channel ID, video ID'}
            />
          </label>
          <button className="primary" disabled={!adminSourceValue.trim() || addYoutubeSource.isPending}>
            <Upload size={17} />
            추가
          </button>
        </form>
        <div className="sourceList archiveTermList">
          {youtubeSources.data?.map((source) => (
            <span key={source.id}>
              <strong>{youtubeSourceOptions.find((option) => option.value === source.source_type)?.label}</strong>
              {source.title}
              <em>{source.source_value}</em>
              {source.backfill_status && source.backfill_status !== 'idle' && <em>{source.backfill_status}</em>}
              <button
                className="chipButton"
                onClick={() => deleteYoutubeSource.mutate(source.id)}
                disabled={deleteYoutubeSource.isPending}
                title="YouTube 소스 삭제"
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
        {youtubeSources.error && <p className="error">{youtubeSources.error.message}</p>}
        {addYoutubeSource.error && <p className="error">{addYoutubeSource.error.message}</p>}
        {deleteYoutubeSource.error && <p className="error">{deleteYoutubeSource.error.message}</p>}
      </section>
      <section className="adminBudget">
        <div className="postHead">
          <div>
            <h2>RAG embeddings</h2>
            <p className="muted">YouTube 자료를 64개 단위 작업으로 임베딩하고 중간 상태를 저장합니다.</p>
          </div>
          <span className="role">
            <Gauge size={15} />
            {ragCoverage.data
              ? `${formatNumber(ragCoverage.data.youtube_embedded_videos)}/${formatNumber(
                  ragCoverage.data.youtube_videos,
                )}`
              : 'loading'}
          </span>
        </div>
        <div className="budgetStats">
          <span>Videos {formatNumber(ragCoverage.data?.youtube_videos)}</span>
          <span>Embedded {formatNumber(ragCoverage.data?.youtube_embedded_videos)}</span>
          <span>Missing {formatNumber(ragCoverage.data?.youtube_missing_videos)}</span>
          <span>Stale {formatNumber(ragCoverage.data?.youtube_stale_videos)}</span>
          <span>Recent 90d {formatNumber(ragCoverage.data?.recent_90d_youtube_videos)}</span>
          <span>90d missing {formatNumber(ragCoverage.data?.recent_90d_missing_videos)}</span>
          <span>Tokens {formatNumber(ragCoverage.data?.estimated_tokens)}</span>
          <span>
            Cost $
            {ragCoverage.data ? ragCoverage.data.estimated_standard_cost_usd.toFixed(4) : '-'}
          </span>
        </div>
        {currentRagJob && (
          <div className="budgetStats">
            <span>Job #{currentRagJob.id}</span>
            <span>Status {currentRagJob.status}</span>
            <span>Scope {currentRagJob.scope}</span>
            <span>Processed {formatNumber(currentRagJob.processed)}</span>
            <span>Embedded {formatNumber(currentRagJob.embedded)}</span>
            <span>Failed {formatNumber(currentRagJob.failed)}</span>
            <span>Remaining {formatNumber(currentRagJob.remaining_missing)}</span>
            <span>Batch {formatNumber(currentRagJob.batch_size)}</span>
          </div>
        )}
        <div className="budgetForm">
          <button
            type="button"
            className="secondary"
            onClick={() => cleanupRag.mutate()}
            disabled={cleanupRag.isPending || startRagJob.isPending || runRagJob.isPending}
          >
            Stale 정리
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => startRagJob.mutate({ scope: 'recent_90d' })}
            disabled={cleanupRag.isPending || startRagJob.isPending || runRagJob.isPending}
          >
            최근 90일 작업 시작
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => startRagJob.mutate({ scope: 'all' })}
            disabled={cleanupRag.isPending || startRagJob.isPending || runRagJob.isPending}
          >
            전체 작업 시작
          </button>
          {currentRagJob && currentRagJob.status !== 'completed' && (
            <button
              type="button"
              className="secondary"
              onClick={() => runRagJob.mutate(currentRagJob.id)}
              disabled={cleanupRag.isPending || startRagJob.isPending || runRagJob.isPending}
            >
              다음 배치 실행
            </button>
          )}
        </div>
        {currentRagJob?.last_error && <p className="error">{currentRagJob.last_error}</p>}
        {ragActionResult && <p className="muted">{ragActionResult}</p>}
        {ragCoverage.error && <p className="error">{ragCoverage.error.message}</p>}
        {ragJob.error && <p className="error">{ragJob.error.message}</p>}
        {cleanupRag.error && <p className="error">{cleanupRag.error.message}</p>}
        {startRagJob.error && <p className="error">{startRagJob.error.message}</p>}
        {runRagJob.error && <p className="error">{runRagJob.error.message}</p>}
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
