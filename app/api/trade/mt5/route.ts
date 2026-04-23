import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";
import { randomBytes } from "crypto";

// GET /api/trade/mt5 — get MT5 config (or create default)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  let config = await MT5ConfigModel.findOne({ userId: session.user.id }).lean();

  if (!config) {
    // Auto-create a secret on first visit
    const secret = randomBytes(32).toString("hex");
    const created = await MT5ConfigModel.create({
      userId: session.user.id,
      webhookSecret: secret,
      connected: false,
    });
    config = created.toObject();
  }

  // Mask the secret — only return first/last 4 chars for display
  const masked = {
    ...(config as object),
    webhookSecret: maskSecret((config as { webhookSecret: string }).webhookSecret),
  };

  return NextResponse.json(masked);
}

// POST /api/trade/mt5 — update broker/accountId info
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, broker } = body;

  await dbConnect();
  const config = await MT5ConfigModel.findOneAndUpdate(
    { userId: session.user.id },
    { $set: { accountId, broker } },
    { new: true, upsert: true }
  ).lean();

  return NextResponse.json({ success: true, accountId: (config as { accountId?: string }).accountId });
}

// POST /api/trade/mt5/regenerate-secret (handled via action in same route)
// Use ?action=regenerate query param
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("action") === "regenerate") {
    const secret = randomBytes(32).toString("hex");
    await dbConnect();
    await MT5ConfigModel.findOneAndUpdate(
      { userId: session.user.id },
      { $set: { webhookSecret: secret, connected: false } },
      { upsert: true }
    );
    return NextResponse.json({ webhookSecret: secret });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return secret.slice(0, 4) + "****" + secret.slice(-4);
}
