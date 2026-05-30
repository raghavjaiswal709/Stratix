import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";

export const dynamic = "force-dynamic";

const METAAPI_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

/**
 * GET /api/mt5/status
 *
 * Returns the current MT5 connection state for the authenticated user.
 *
 * Response shapes:
 *   { state: "NONE" }                            — no account registered
 *   { state: "DEPLOYED", connected: true, mt5Login, mt5Server, mt5AccountId }
 *   { state: "DEPLOYING" | "CREATED" | ..., connected: false }
 *
 * When connected is already true in DB, MetaApi is NOT called (fast path).
 * When an accountId exists but connected is false, MetaApi is polled and DB is
 * updated if the account has reached DEPLOYED state.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const config = await MT5ConfigModel.findOne({ userId: session.user.id }).lean() as {
    mt5AccountId?: string;
    mt5Login?: string;
    mt5Server?: string;
    connected?: boolean;
    mt5ConnectedAt?: Date;
  } | null;

  // No account registered at all
  if (!config?.mt5AccountId) {
    return NextResponse.json({ state: "NONE", connected: false });
  }

  // Fast path: already deployed
  if (config.connected) {
    return NextResponse.json({
      state: "DEPLOYED",
      connected: true,
      mt5AccountId: config.mt5AccountId,
      mt5Login: config.mt5Login ?? null,
      mt5Server: config.mt5Server ?? null,
    });
  }

  // Poll MetaApi for current deployment state
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Server MetaApi configuration missing" },
      { status: 500 }
    );
  }

  const metaRes = await fetch(
    `${METAAPI_BASE}/users/current/accounts/${config.mt5AccountId}`,
    {
      headers: { "auth-token": token },
      cache: "no-store",
    }
  );

  if (!metaRes.ok) {
    const text = await metaRes.text();
    return NextResponse.json(
      { error: `MetaApi error (${metaRes.status}): ${text}` },
      { status: metaRes.status }
    );
  }

  const data: { id: string; state: string } = await metaRes.json();

  // If newly deployed, update DB
  if (data.state === "DEPLOYED") {
    await MT5ConfigModel.findOneAndUpdate(
      { userId: session.user.id },
      { $set: { connected: true, mt5ConnectedAt: new Date() } }
    );
    return NextResponse.json({
      state: "DEPLOYED",
      connected: true,
      mt5AccountId: config.mt5AccountId,
      mt5Login: config.mt5Login ?? null,
      mt5Server: config.mt5Server ?? null,
    });
  }

  return NextResponse.json({ state: data.state, connected: false });
}
