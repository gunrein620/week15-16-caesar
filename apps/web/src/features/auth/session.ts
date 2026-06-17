const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginDependencies = {
  findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null>;
  verifyPassword(password: string, passwordHash: string): Promise<boolean>;
  createSession(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  createSessionToken(): string;
  hashSessionToken(token: string): string;
  now(): Date;
};

export type LoginResult = {
  user: AuthUser;
  sessionToken: string;
  expiresAt: Date;
};

export async function loginUser(
  input: LoginInput,
  dependencies: LoginDependencies
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const user = await dependencies.findUserByEmail(email);

  if (!user) {
    throw new Error("email or password is invalid");
  }

  const passwordMatches = await dependencies.verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error("email or password is invalid");
  }

  const sessionToken = dependencies.createSessionToken();
  const tokenHash = dependencies.hashSessionToken(sessionToken);
  const expiresAt = new Date(dependencies.now().getTime() + SESSION_DURATION_MS);

  await dependencies.createSession({
    userId: user.id,
    tokenHash,
    expiresAt
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    },
    sessionToken,
    expiresAt
  };
}

export type CurrentUserDependencies = {
  hashSessionToken(token: string): string;
  findValidSessionByTokenHash(
    tokenHash: string,
    now: Date
  ): Promise<{ user: AuthUser } | null>;
  now(): Date;
};

export async function getCurrentUser(
  sessionToken: string | undefined,
  dependencies: CurrentUserDependencies
): Promise<AuthUser | null> {
  if (!sessionToken) {
    return null;
  }

  const tokenHash = dependencies.hashSessionToken(sessionToken);
  const session = await dependencies.findValidSessionByTokenHash(tokenHash, dependencies.now());

  return session?.user ?? null;
}

export type LogoutDependencies = {
  hashSessionToken(token: string): string;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
};

export async function logoutUser(
  sessionToken: string | undefined,
  dependencies: LogoutDependencies
): Promise<void> {
  if (!sessionToken) {
    return;
  }

  await dependencies.deleteSessionByTokenHash(dependencies.hashSessionToken(sessionToken));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
