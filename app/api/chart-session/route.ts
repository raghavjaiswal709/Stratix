import { NextResponse } from "next/server";
// Chart session service temporarily disabled.
// import { handleChartSession } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function DELETE(_request: Request) {
  return NextResponse.json(
    { error: "Live chart service is temporarily disabled." },
    { status: 503 }
  );
}
