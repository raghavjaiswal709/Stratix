import { NextResponse } from "next/server";
// Chart tick service temporarily disabled.
// import { handleChartTick } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: "Live chart service is temporarily disabled." },
    { status: 503 }
  );
}
