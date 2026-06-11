import { Bell, Bot, Home, LogIn, LogOut, Map, Menu, PenLine, Search, UserRound, UsersRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { boardCategories, boardFilters, type BoardCategory, type BoardFilter } from '../board/boardFilters.js';
import { BottomNav } from './BottomNav.js';
import { FloatingWriteButton } from './FloatingWriteButton.js';

export type AppView = 'home' | 'community' | 'map' | 'detail' | 'editor' | 'ai' | 'login' | 'signup';

type AppShellProps = {
  children: ReactNode;
  view: AppView;
  regionName: string;
  isAuthed: boolean;
  activeCategory: BoardCategory;
  activeFilter: BoardFilter;
  onCategoryChange: (category: BoardCategory) => void;
  onFilterChange: (filter: BoardFilter) => void;
  searchQuery: string;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
};

export function AppShell({
  children,
  view,
  regionName,
  isAuthed,
  activeCategory,
  activeFilter,
  onCategoryChange,
  onFilterChange,
  searchQuery,
  onSearch,
  onClearSearch,
  onNavigate,
  onLogout
}: AppShellProps) {
  const [activePanel, setActivePanel] = useState<'search' | 'alerts' | 'menu' | null>(null);
  const [searchText, setSearchText] = useState(searchQuery);
  const showWrite = view === 'home' || view === 'community' || view === 'detail';
  const showBoardTabs = view === 'home' || view === 'community';

  useEffect(() => {
    setSearchText(searchQuery);
  }, [searchQuery]);

  function togglePanel(panel: 'search' | 'alerts' | 'menu') {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  function navigate(next: AppView) {
    setActivePanel(null);
    onNavigate(next);
  }

  function submitSearch(query = searchText) {
    const nextQuery = query.trim();
    setSearchText(nextQuery);
    onSearch(nextQuery);
    setActivePanel(null);
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button className="region-button" type="button" aria-label="현재 지역">
          <span>{regionName}</span>
        </button>
        <nav className="top-actions" aria-label="상단 도구">
          <button
            type="button"
            aria-label="검색"
            aria-expanded={activePanel === 'search'}
            onClick={() => togglePanel('search')}
          >
            <Search size={22} />
          </button>
          <button
            className="alert-dot"
            type="button"
            aria-label="알림"
            aria-expanded={activePanel === 'alerts'}
            onClick={() => togglePanel('alerts')}
          >
            <Bell size={22} />
          </button>
          <button
            type="button"
            aria-label="메뉴"
            aria-expanded={activePanel === 'menu'}
            onClick={() => togglePanel('menu')}
          >
            <Menu size={24} />
          </button>
        </nav>
      </header>

      {activePanel === 'search' && (
        <section className="top-panel" aria-label="검색 패널">
          <div className="panel-title-row">
            <strong>오산 게시글 검색</strong>
            <button type="button" aria-label="검색 닫기" onClick={() => setActivePanel(null)}>
              <X size={18} />
            </button>
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <Search size={18} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="약국, 주차, 플리마켓 검색"
              aria-label="게시글 검색어"
            />
            <button type="submit">검색</button>
          </form>
          <div className="quick-searches" aria-label="빠른 검색어">
            {['야간 약국', '불법 주차', '플리마켓', '분실물'].map((keyword) => (
              <button type="button" key={keyword} onClick={() => submitSearch(keyword)}>
                {keyword}
              </button>
            ))}
          </div>
          {searchQuery && (
            <button className="text-row-button" type="button" onClick={onClearSearch}>
              현재 검색어 “{searchQuery}” 지우기
            </button>
          )}
        </section>
      )}

      {activePanel === 'alerts' && (
        <section className="top-panel" aria-label="알림 패널">
          <div className="panel-title-row">
            <strong>동네 알림</strong>
            <button type="button" aria-label="알림 닫기" onClick={() => setActivePanel(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="notice-list">
            <button type="button" onClick={() => navigate('ai')}>
              <span>AI 민원 도우미</span>
              <small>주정차 민원은 유사 게시글과 접수처를 함께 판단합니다.</small>
            </button>
            <button type="button" onClick={() => submitSearch('야간 약국')}>
              <span>생활정보</span>
              <small>야간 약국 질문은 장소 검색과 게시판 후기를 함께 확인할 수 있습니다.</small>
            </button>
            <button type="button" onClick={() => submitSearch('플리마켓')}>
              <span>동네 행사</span>
              <small>이번 주말 행사 글과 날씨 기반 AI 답변을 확인해 보세요.</small>
            </button>
          </div>
        </section>
      )}

      {activePanel === 'menu' && (
        <section className="top-panel" aria-label="메뉴 패널">
          <div className="panel-title-row">
            <strong>바로가기</strong>
            <button type="button" aria-label="메뉴 닫기" onClick={() => setActivePanel(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="menu-grid">
            <button type="button" onClick={() => navigate('editor')}>
              <PenLine size={18} />
              글쓰기
            </button>
            <button type="button" onClick={() => navigate('ai')}>
              <Bot size={18} />
              AI도우미
            </button>
            <button type="button" onClick={() => navigate('community')}>
              <UsersRound size={18} />
              커뮤니티
            </button>
            <button type="button" onClick={() => navigate('map')}>
              <Map size={18} />
              동네지도
            </button>
          </div>
          <button
            className="menu-account-button"
            type="button"
            onClick={() => {
              setActivePanel(null);
              if (isAuthed) {
                onLogout();
              } else {
                onNavigate('login');
              }
            }}
          >
            {isAuthed ? <LogOut size={18} /> : <LogIn size={18} />}
            {isAuthed ? '로그아웃' : '로그인'}
          </button>
        </section>
      )}

      {showBoardTabs && (
        <>
          <nav className="category-tabs" aria-label="게시판 카테고리">
            {boardCategories.map((item) => (
              <button
                aria-pressed={activeCategory === item}
                className={activeCategory === item ? 'active' : ''}
                type="button"
                key={item}
                onClick={() => {
                  onCategoryChange(item);
                  if (view !== 'community') {
                    onNavigate('community');
                  }
                }}
              >
                {item}
              </button>
            ))}
          </nav>

          <nav className="filter-chips" aria-label="게시글 필터">
            {boardFilters.map((item) => (
              <button
                aria-pressed={activeFilter === item}
                className={activeFilter === item ? 'selected' : ''}
                type="button"
                key={item}
                onClick={() => {
                  onFilterChange(item);
                  if (view !== 'community') {
                    onNavigate('community');
                  }
                }}
              >
                {item}
              </button>
            ))}
          </nav>
        </>
      )}

      <main className="screen-content">{children}</main>

      {showWrite && (
        <FloatingWriteButton
          onWrite={() => {
            onNavigate('editor');
          }}
          onAi={() => {
            onNavigate('ai');
          }}
        />
      )}

      <BottomNav
        active={view}
        items={[
          { view: 'home', label: '홈', icon: <Home size={23} /> },
          { view: 'community', label: '커뮤니티', icon: <UsersRound size={24} /> },
          { view: 'map', label: '동네지도', icon: <Map size={23} /> },
          { view: 'ai', label: 'AI도우미', icon: <Bot size={23} /> },
          {
            view: 'login',
            label: isAuthed ? '로그아웃' : '로그인',
            icon: isAuthed ? <LogOut size={22} /> : <LogIn size={22} />,
            onClick: isAuthed ? onLogout : undefined
          },
          { view: 'login', label: '마이', icon: <UserRound size={22} />, hidden: true }
        ]}
        onNavigate={onNavigate}
      />
    </div>
  );
}
