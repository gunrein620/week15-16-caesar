import { Bell, Bot, Home, LogIn, LogOut, Map, Menu, Plus, Search, UserRound, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav.js';
import { FloatingWriteButton } from './FloatingWriteButton.js';

export type AppView = 'home' | 'detail' | 'editor' | 'ai' | 'login' | 'signup';

type AppShellProps = {
  children: ReactNode;
  view: AppView;
  regionName: string;
  isAuthed: boolean;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
};

export function AppShell({ children, view, regionName, isAuthed, onNavigate, onLogout }: AppShellProps) {
  const showWrite = view === 'home' || view === 'detail';

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

      <nav className="category-tabs" aria-label="게시판 카테고리">
        {['동네생활', '모임', '카페', '아파트', '게임', '맛집/음식'].map((item, index) => (
          <button className={index === 0 ? 'active' : ''} type="button" key={item}>
            {item}
          </button>
        ))}
      </nav>

      <nav className="filter-chips" aria-label="게시글 필터">
        {['추천', '인기', '투표', '생활정보', 'AI추천'].map((item, index) => (
          <button className={index === 0 ? 'selected' : ''} type="button" key={item}>
            {item}
          </button>
        ))}
      </nav>

      <main className="screen-content">{children}</main>

      {showWrite && (
        <FloatingWriteButton
          onClick={() => {
            onNavigate('editor');
          }}
        >
          <Plus size={22} />
          글쓰기
        </FloatingWriteButton>
      )}

      <BottomNav
        active={view}
        items={[
          { view: 'home', label: '홈', icon: <Home size={23} /> },
          { view: 'home', label: '커뮤니티', icon: <UsersRound size={24} /> },
          { view: 'home', label: '동네지도', icon: <Map size={23} /> },
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
