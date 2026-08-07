import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "Motion video segmentation is only available in local development mode. Please run the app locally using 'npm run dev' to use this feature." },
      { status: 503 }
    );
  }

  const { handleMotionSegmentLocal } = await import("@/lib/motion-segment-local");
  return handleMotionSegmentLocal(req);
}
