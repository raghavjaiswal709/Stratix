import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHART_SERVICES_DISABLED = true;

export async function GET(request: Request) {
  if (CHART_SERVICES_DISABLED) {
    return NextResponse.json(
      { error: "Chart candles service is temporarily disabled." },
      { status: 503 }
    );
  }
  
  // To restore, import handleChartCandles from "@/chart-page/server/chartRoutes" and return handleChartCandles(request);
  return NextResponse.json({ error: "Service disabled" }, { status: 503 });
}
