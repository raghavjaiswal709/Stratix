import { readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export interface ReportEntry {
  date: string;
  session: string;
  filename: string;
}

const SESSION_ORDER = ["asian", "london", "new_york"];

export async function GET() {
  const dir = join(process.cwd(), "public", "reports");

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return NextResponse.json([] as ReportEntry[]);
  }

  const reports: ReportEntry[] = files
    .filter((f) => f.endsWith("_session.json"))
    .flatMap((f) => {
      // filename: YYYY-MM-DD_session_session.json  e.g. 2026-06-06_new_york_session.json
      const withoutExt = f.replace(/\.json$/, "");
      const match = withoutExt.match(/^(\d{4}-\d{2}-\d{2})_(.+)_session$/);
      if (!match) return [];
      return [{ date: match[1], session: match[2], filename: f }];
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session);
    });

  return NextResponse.json(reports);
}
