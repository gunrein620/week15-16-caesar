import { Bell, Bot, Home, LogIn, LogOut, Map, Menu, Search, UserRound, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
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
  onNavigate,
  onLogout
}: AppShellProps) {
  const showWrite = view === 'home' || view === 'community' || view === 'detail';
  const showBoardTabs = view === 'home' || view === 'community';

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button className="region-button" type="button" aria-label="현재 지역">
          <span>{regionName}</span>
        </button>
        <nav className="top-actions" aria-label="상단 도구">
          <button type="button" aria-label="검색">
            <Search size={22} />
          </button>
          <button className="alert-dot" type="button" aria-label="알림">
            <Bell size={22} />
          </button>
          <button type="button" aria-label="메뉴">
            <Menu size={24} />
          </button>
        </nav>
      </header>

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
