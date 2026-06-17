import { hashSessionToken } from "@junglebob/ai";
import { prisma } from "@junglebob/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";
import { getCurrentUser, type AuthUser } from "@/features/auth/session";

export async function getCurrentUserFromCookies(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getCurrentUser(sessionToken, {
    hashSessionToken,
    findValidSessionByTokenHash: async (tokenHash, now) => {
      const session = await prisma.session.findFirst({
        where: {
          tokenHash,
          expiresAt: { gt: now }
        },
        select: {
          user: {
            select: { id: true, email: true, name: true }
          }
        }
      });

      return session;
    },
    now: () => new Date()
  });
}
