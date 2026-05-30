import { handleChartSession } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function DELETE(request: Request) {
  return handleChartSession(request);
}
