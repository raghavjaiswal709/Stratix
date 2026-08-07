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

  // Prevent Next.js static NFT bundler from tracing local helper during Vercel build
  const reqFn = eval("require");
  const { handleMotionSegmentLocal } = reqFn("@/lib/motion-segment-local");
  return handleMotionSegmentLocal(req);
}
