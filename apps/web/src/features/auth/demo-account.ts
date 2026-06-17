// 데모 체험용 고정 계정. 처음 사용 시 자동 생성(signup)되고, 이후에는 바로 로그인됩니다.
export const DEMO_ACCOUNT = {
  email: "demo@junglebob.kr",
  name: "정글밥 데모",
  password: "junglebob-demo"
} as const;

type LoginFn = (body: { email: string; password: string }) => Promise<Response>;

/**
 * 데모 계정으로 로그인합니다.
 * - 먼저 로그인을 시도하고, 계정이 없으면(401) 회원가입 후 다시 로그인합니다.
 * - 성공하면 true, 실패하면 false를 반환합니다.
 */
export async function loginWithDemoAccount(): Promise<boolean> {
  const login: LoginFn = (body) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

  try {
    const first = await login({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    if (first.ok) {
      return true;
    }

    // 계정 미존재로 추정 → 생성 후 재시도
    await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: DEMO_ACCOUNT.email,
        name: DEMO_ACCOUNT.name,
        password: DEMO_ACCOUNT.password
      })
    });

    const second = await login({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    return second.ok;
  } catch {
    return false;
  }
}
