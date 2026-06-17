import { NextResponse } from "next/server";

import { getOAuthProviderStatuses } from "@/lib/oauth-provider-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    providers: getOAuthProviderStatuses(),
  });
}
