import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb-client";

export const dynamic = "force-dynamic";

/** One-time sign-in ticket for Footprint Pro; the Footprint engine checks it in the same MongoDB. */
interface TicketDoc {
  /** SHA-256 of the ticket (the ticket itself is only in the link) */
  _id: string;
  email: string;
  name: string;
  image: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

const TICKET_TTL_MS = 2 * 60_000;

/**
 * POST /api/footprint-access/ticket — the sign-in link of Footprint Pro for the signed-in Stratix user.
 * Footprint's public link changes on every start, so it cannot use Google sign-in itself: it trusts this ticket
 * (valid for two minutes, once) and then asks for its own password. The user's layouts, settings and paper
 * account in Footprint belong to this e-mail.
 */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();
  const access = await db.collection<{ _id: string; url?: string }>("footprint_access").findOne({ _id: "footprint" });
  const url = access?.url && /^https:\/\/[^\s"'<>]+$/.test(access.url) ? access.url.replace(/\/+$/, "") : null;
  if (!url) {
    return NextResponse.json({ error: "Footprint is not running right now." }, { status: 404 });
  }

  const ticket = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.collection<TicketDoc>("footprint_tickets").insertOne({
    _id: crypto.createHash("sha256").update(ticket).digest("hex"),
    email,
    name: session.user.name ?? "",
    image: session.user.image ?? "",
    role: session.user.role ?? "user",
    createdAt: new Date(now),
    expiresAt: new Date(now + TICKET_TTL_MS),
    used: false,
  });

  return NextResponse.json(
    { url: `${url}/__fp/sso?ticket=${encodeURIComponent(ticket)}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
