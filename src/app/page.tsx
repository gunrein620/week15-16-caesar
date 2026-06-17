import { getServerSession } from "next-auth";

import SnackCourtApp from "@/components/snack-court-app";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <SnackCourtApp
      initialSession={
        session?.user
          ? {
              user: {
                id: session.user.id,
                name: session.user.name ?? null,
                email: session.user.email ?? null,
                image: session.user.image ?? null,
              },
            }
          : null
      }
    />
  );
}
