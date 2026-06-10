import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

// env에 키가 있는 프로바이더만 활성화 — 로그인 화면이 이 플래그로 버튼을 켜고 끈다.
export const enabledProviders = {
  kakao: Boolean(process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET),
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  guest: process.env.GUEST_LOGIN === "1",
};

const providers: NextAuthConfig["providers"] = [];

if (enabledProviders.kakao) providers.push(Kakao);
if (enabledProviders.google) providers.push(Google);
if (enabledProviders.guest) {
  providers.push(
    Credentials({
      id: "guest",
      name: "게스트",
      credentials: {},
      async authorize() {
        // OAuth 키 없이 플로우를 테스트하기 위한 시드 데모 계정
        const user = await prisma.user.upsert({
          where: { email: "demo@jungle.market" },
          update: {},
          create: {
            email: "demo@jungle.market",
            name: "정글러",
            nickname: "정글러",
            town: "역삼동",
            isGuest: true,
          },
        });
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials(게스트) 프로바이더는 DB 세션과 함께 쓸 수 없어 JWT 전략을 쓴다.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});

/** 현재 로그인한 사용자의 DB 레코드 (없으면 null) */
export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}
