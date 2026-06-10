import { useMemo, useState } from 'react';
import { clearAccessToken, getAccessToken, setAccessToken, type AuthResponse, type Post } from './api/client.js';
import type { BoardCategory, BoardFilter } from './board/boardFilters.js';
import { AppShell, type AppView } from './components/AppShell.js';
import { AiAssistantPage } from './pages/AiAssistantPage.js';
import { CommunityPage } from './pages/CommunityPage.js';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NeighborhoodMapPage } from './pages/NeighborhoodMapPage.js';
import { PostDetailPage } from './pages/PostDetailPage.js';
import { PostEditorPage } from './pages/PostEditorPage.js';
import { SignupPage } from './pages/SignupPage.js';

export function App() {
  const [view, setView] = useState<AppView>(getAccessToken() ? 'home' : 'home');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [activeCategory, setActiveCategory] = useState<BoardCategory>('동네생활');
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('추천');

  const isAuthed = useMemo(() => Boolean(getAccessToken()), [user, view]);
  const boardState = useMemo(
    () => ({ category: activeCategory, filter: activeFilter }),
    [activeCategory, activeFilter]
  );

  function handleAuth(auth: AuthResponse) {
    setAccessToken(auth.accessToken);
    setUser(auth.user);
    setView('home');
  }

  function logout() {
    clearAccessToken();
    setUser(null);
    setView('login');
  }

  return (
    <AppShell
      view={view}
      regionName="오산"
      isAuthed={isAuthed}
      activeCategory={activeCategory}
      activeFilter={activeFilter}
      onCategoryChange={setActiveCategory}
      onFilterChange={setActiveFilter}
      onNavigate={(next) => {
        setView(next);
        if (next !== 'detail') {
          setSelectedPost(null);
        }
      }}
      onLogout={logout}
    >
      {view === 'home' && (
        <HomePage
          onOpenPost={(post) => {
            setSelectedPost(post);
            setView('detail');
          }}
          onAskAi={() => setView('ai')}
          boardState={boardState}
        />
      )}
      {view === 'community' && (
        <CommunityPage
          boardState={boardState}
          onOpenPost={(post) => {
            setSelectedPost(post);
            setView('detail');
          }}
        />
      )}
      {view === 'map' && <NeighborhoodMapPage />}
      {view === 'detail' && <PostDetailPage post={selectedPost} onBack={() => setView('home')} />}
      {view === 'editor' && <PostEditorPage isAuthed={isAuthed} onDone={() => setView('home')} onLogin={() => setView('login')} />}
      {view === 'ai' && <AiAssistantPage isAuthed={isAuthed} onLogin={() => setView('login')} />}
      {view === 'login' && <LoginPage onSuccess={handleAuth} onSignup={() => setView('signup')} />}
      {view === 'signup' && <SignupPage onSuccess={handleAuth} onLogin={() => setView('login')} />}
    </AppShell>
  );
}
