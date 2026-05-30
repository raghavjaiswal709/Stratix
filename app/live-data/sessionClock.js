export const SESSIONS = {
  SYDNEY: { name: "Sydney", open: 21, close: 6, timezone: "Australia/Sydney" },
  TOKYO: { name: "Tokyo", open: 0, close: 9, timezone: "Asia/Tokyo" },
  LONDON: { name: "London", open: 8, close: 17, timezone: "Europe/London" },
  NEW_YORK: { name: "New York", open: 13, close: 22, timezone: "America/New_York" }
};

export function getSessionStatus(sessionKey, utcHour) {
  const sess = SESSIONS[sessionKey];
  if (!sess) return false;

  const { open, close } = sess;
  if (open < close) {
    return utcHour >= open && utcHour < close;
  } else {
    // Handles overnight wrapping (e.g. Sydney open at 21:00 and close at 06:00)
    return utcHour >= open || utcHour < close;
  }
}

export function getFormattedSessionTime(timezone) {
  try {
    return new Date().toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return "00:00:00";
  }
}

export function getMarketSessions() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  return Object.keys(SESSIONS).map((key) => {
    const sess = SESSIONS[key];
    const isOpen = getSessionStatus(key, utcHour);
    const localTime = getFormattedSessionTime(sess.timezone);
    return {
      id: key,
      name: sess.name,
      isOpen,
      localTime
    };
  });
}
