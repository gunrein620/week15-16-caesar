export type SignupInput = {
  email: string;
  name: string;
  password: string;
};

export type SignupUserResult = {
  id: string;
  email: string;
  name: string;
};

export type SignupDependencies = {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUser(data: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<SignupUserResult>;
  hashPassword(password: string): Promise<string>;
};

export async function signupUser(
  input: SignupInput,
  dependencies: SignupDependencies
): Promise<SignupUserResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const password = input.password;

  if (!email.includes("@")) {
    throw new Error("올바른 이메일을 입력해야 합니다.");
  }

  if (!name) {
    throw new Error("이름을 입력해야 합니다.");
  }

  if (password.length < 8) {
    throw new Error("비밀번호는 8자 이상이어야 합니다.");
  }

  const existingUser = await dependencies.findUserByEmail(email);

  if (existingUser) {
    throw new Error("이미 가입된 이메일입니다.");
  }

  const passwordHash = await dependencies.hashPassword(password);

  return dependencies.createUser({
    email,
    name,
    passwordHash
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
