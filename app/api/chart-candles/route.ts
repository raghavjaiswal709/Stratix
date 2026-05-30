import { handleChartCandles } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(request: Request) {
  return handleChartCandles(request);
}
