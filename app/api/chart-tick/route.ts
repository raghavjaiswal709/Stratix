import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

const CHART_SERVICES_DISABLED = true;

export async function GET(request: Request) {
  if (CHART_SERVICES_DISABLED) {
    return NextResponse.json(
      { error: "Chart tick service is temporarily disabled." },
      { status: 503 }
    );
  }
  
  // To restore, import handleChartTick from "@/chart-page/server/chartRoutes" and return handleChartTick(request);
  return NextResponse.json({ error: "Service disabled" }, { status: 503 });
}
