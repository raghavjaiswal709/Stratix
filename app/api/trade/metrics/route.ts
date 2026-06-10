import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMetricsForUser } from "@/lib/metrics-service";

export const dynamic = "force-dynamic";

// GET /api/trade/metrics?profileId=... — precomputed dashboard metrics for the
// current user/profile. Read straight from the DB; recomputed only when the
// underlying trades have changed (see getMetricsForUser).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = new URL(req.url).searchParams.get("profileId");
  const metrics = await getMetricsForUser(session.user.id, profileId);
  return NextResponse.json(metrics);
}
