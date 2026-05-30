import { NextResponse } from "next/server";

/**
 * The old webhook-based MT5 configuration endpoints have been removed.
 * Use the new MetaApi-based routes instead:
 *   POST   /api/mt5/connect   — register MT5 account with MetaApi
 *   DELETE /api/mt5/connect   — disconnect account
 *   GET    /api/mt5/status    — check deployment state
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use /api/mt5/status instead." },
    { status: 410 }
  );
}

export function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use /api/mt5/connect instead." },
    { status: 410 }
  );
}

export function PUT() {
  return NextResponse.json(
    { error: "This endpoint has been removed." },
    { status: 410 }
  );
}
