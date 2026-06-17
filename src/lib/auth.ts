import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import KakaoProvider from "next-auth/providers/kakao";
import NaverProvider from "next-auth/providers/naver";

import { isOAuthProviderConfigured } from "@/lib/oauth-provider-status";
import { prisma } from "@/lib/prisma";

const providers = [
  ...(isOAuthProviderConfigured("google")
    ? [
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]
    : []),
  ...(isOAuthProviderConfigured("kakao")
    ? [
        KakaoProvider({
          clientId: process.env.AUTH_KAKAO_ID!,
          clientSecret: process.env.AUTH_KAKAO_SECRET!,
        }),
      ]
    : []),
  ...(isOAuthProviderConfigured("naver")
    ? [
        NaverProvider({
          clientId: process.env.AUTH_NAVER_ID!,
          clientSecret: process.env.AUTH_NAVER_SECRET!,
        }),
      ]
    : []),
];

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as never) as Adapter,
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "local-development-secret-replace-before-production",
  session: {
    strategy: "database",
  },
  providers,
  callbacks: {
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
};
