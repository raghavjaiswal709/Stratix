import { handleChartTick } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  return handleChartTick(request);
}
