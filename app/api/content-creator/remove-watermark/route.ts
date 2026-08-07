import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "Watermark removal is only available in local development mode. Please run the app locally using 'npm run dev' to use this feature." },
      { status: 503 }
    );
  }

  const { handleRemoveWatermarkLocal } = await import("@/lib/remove-watermark-local");
  return handleRemoveWatermarkLocal(req);
}
