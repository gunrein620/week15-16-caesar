import { LogIn } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api, setAccessToken, type AuthResponse } from '../api/client.js';

type LoginPageProps = {
  onSuccess: (auth: AuthResponse) => void;
  onSignup: () => void;
};

export function LoginPage({ onSuccess, onSignup }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const auth = await api.login({ email, password });
      setAccessToken(auth.accessToken);
      onSuccess(auth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    }
  }

  return (
    <form className="auth-page" onSubmit={submit}>
      <h1>로그인</h1>
      <label>
        이메일
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="osan@example.com" />
      </label>
      <label>
        비밀번호
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="8자 이상" />
      </label>
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button" type="submit">
        <LogIn size={18} /> 로그인
      </button>
      <button className="text-button" type="button" onClick={onSignup}>
        회원가입
      </button>
    </form>
  );
}
