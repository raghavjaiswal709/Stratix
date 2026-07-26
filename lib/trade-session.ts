import { toIST, TradeTimeSource } from "@/lib/utils/ist-time";

export type TradingSession = "Asian" | "London" | "NY" | "No Session";

export interface SessionInfo {
  session: TradingSession;
  shortLabel: string;
  isViolation: boolean;
  label: string;
}

/**
 * Calculates the trading session matching TradingView / true IST clock:
 * Correctly accounts for MT5 broker offset (+2h30m gap to IST) via `toIST(isoString, source)`.
 *
 * Session hours (in true IST):
 * - 05:30 AM to 09:30 AM IST -> Asian Session (A)
 * - 11:00 AM to 02:30 PM IST (11:00 to 14:30) -> London Session (L)
 * - 04:30 PM to 09:30 PM IST (16:30 to 21:30) -> NY Session (NY)
 * - Outside these hours -> No Session (NS - Rule Violation)
 */
export function getTradingSession(isoString?: string, source?: TradeTimeSource): SessionInfo {
  if (!isoString) {
    return { session: "No Session", shortLabel: "-", isViolation: true, label: "No Session" };
  }

  const istDate = toIST(isoString, source);
  if (isNaN(istDate.getTime())) {
    return { session: "No Session", shortLabel: "-", isViolation: true, label: "No Session" };
  }

  const hour = istDate.getUTCHours();
  const minute = istDate.getUTCMinutes();
  const totalMins = hour * 60 + minute;

  // 1. Asian Session: 05:30 to 09:30 IST (330 to 570 mins)
  if (totalMins >= 330 && totalMins <= 570) {
    return { session: "Asian", shortLabel: "A", isViolation: false, label: "Asian Session" };
  }

  // 2. London Session: 11:00 to 14:30 IST (660 to 870 mins)
  if (totalMins >= 660 && totalMins <= 870) {
    return { session: "London", shortLabel: "L", isViolation: false, label: "London Session" };
  }

  // 3. NY Session: 16:30 to 21:30 IST (990 to 1290 mins)
  if (totalMins >= 990 && totalMins <= 1290) {
    return { session: "NY", shortLabel: "NY", isViolation: false, label: "NY Session" };
  }

  // Outside session hours
  return { session: "No Session", shortLabel: "-", isViolation: true, label: "No Session" };
}

export function getSessionBadgeClasses(session: TradingSession): string {
  switch (session) {
    case "Asian":
    case "London":
    case "NY":
    case "No Session":
    default:
      return "bg-transparent text-zinc-400 border-none font-semibold";
  }
}

export function getSessionTextColor(session: TradingSession): string {
  switch (session) {
    case "Asian":
    case "London":
    case "NY":
    case "No Session":
    default:
      return "text-zinc-400 font-semibold";
  }
}
