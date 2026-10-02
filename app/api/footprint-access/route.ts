import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb-client";

export const dynamic = "force-dynamic";

/**
 * Written by the Footprint Pro engine (the order-flow platform on the trading Mac) whenever its public link
 * changes, and refreshed every minute while the link is live. Only the link is stored, never the password.
 */
interface FootprintAccessDoc {
  _id: string;
  url?: string;
  online?: boolean;
  since?: Date;
  lastSeen?: Date;
  updatedAt?: Date;
}

/** The link counts as live while the engine has refreshed it recently (it does so every minute). */
const LIVE_WITHIN_MS = 3 * 60_000;

/** GET /api/footprint-access — whether Footprint Pro is running, and its current link. Any signed-in user. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const doc = await client.db().collection<FootprintAccessDoc>("footprint_access").findOne({ _id: "footprint" });

  const url = doc?.url && /^https:\/\/[^\s"'<>]+$/.test(doc.url) ? doc.url : null;
  const lastSeen = doc?.lastSeen ? new Date(doc.lastSeen).getTime() : null;
  const online = !!url && !!doc?.online && lastSeen !== null && Date.now() - lastSeen < LIVE_WITHIN_MS;

  return NextResponse.json(
    {
      url,
      online,
      since: doc?.since ? new Date(doc.since).getTime() : null,
      lastSeen,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
