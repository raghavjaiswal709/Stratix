import { handleChartCandles } from "@/chart-page/server/chartRoutes";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleChartCandles(request);
}
