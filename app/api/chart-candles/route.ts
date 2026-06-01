import { NextResponse } from "next/server";
// Chart candles service temporarily disabled.
// import { handleChartCandles } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: "Live chart service is temporarily disabled." },
    { status: 503 }
  );
}
