import { UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api, setAccessToken, type AuthResponse } from '../api/client.js';

type SignupPageProps = {
  onSuccess: (auth: AuthResponse) => void;
  onLogin: () => void;
};

export function SignupPage({ onSuccess, onLogin }: SignupPageProps) {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const auth = await api.signup({ email, nickname, password });
      setAccessToken(auth.accessToken);
      onSuccess(auth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '회원가입에 실패했습니다.');
    }
  }

  return (
    <form className="auth-page" onSubmit={submit}>
      <h1>오산 이웃으로 시작하기</h1>
      <label>
        이메일
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="osan@example.com" />
      </label>
      <label>
        닉네임
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="오산이웃" />
      </label>
      <label>
        비밀번호
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="8자 이상" />
      </label>
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button" type="submit">
        <UserPlus size={18} /> 가입
      </button>
      <button className="text-button" type="button" onClick={onLogin}>
        로그인
      </button>
    </form>
  );
}
