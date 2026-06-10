import { useMemo, useState } from 'react';
import { clearAccessToken, getAccessToken, setAccessToken, type AuthResponse, type Post } from './api/client.js';
import { AppShell, type AppView } from './components/AppShell.js';
import { AiAssistantPage } from './pages/AiAssistantPage.js';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { PostDetailPage } from './pages/PostDetailPage.js';
import { PostEditorPage } from './pages/PostEditorPage.js';
import { SignupPage } from './pages/SignupPage.js';

export function App() {
  const [view, setView] = useState<AppView>(getAccessToken() ? 'home' : 'home');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);

  const isAuthed = useMemo(() => Boolean(getAccessToken()), [user, view]);

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
        />
      )}
      {view === 'detail' && <PostDetailPage post={selectedPost} onBack={() => setView('home')} />}
      {view === 'editor' && <PostEditorPage isAuthed={isAuthed} onDone={() => setView('home')} onLogin={() => setView('login')} />}
      {view === 'ai' && <AiAssistantPage isAuthed={isAuthed} onLogin={() => setView('login')} />}
      {view === 'login' && <LoginPage onSuccess={handleAuth} onSignup={() => setView('signup')} />}
      {view === 'signup' && <SignupPage onSuccess={handleAuth} onLogin={() => setView('login')} />}
    </AppShell>
  );
}
