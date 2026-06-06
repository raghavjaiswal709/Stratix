import { readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export interface NewsEntry {
  date: string;
  session: string;
  filename: string;
}

const SESSION_ORDER = ["asian", "london", "new_york"];

export async function GET() {
  const dir = join(process.cwd(), "public", "data", "news");

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return NextResponse.json([] as NewsEntry[]);
  }

  const reports: NewsEntry[] = files
    .filter((f) => f.endsWith("_news.json"))
    .flatMap((f) => {
      // filename: YYYY-MM-DD_session_news.json  e.g. 2026-06-06_new_york_news.json
      const withoutExt = f.replace(/\.json$/, "");
      const match = withoutExt.match(/^(\d{4}-\d{2}-\d{2})_(.+)_news$/);
      if (!match) return [];
      return [{ date: match[1], session: match[2], filename: f }];
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session);
    });

  return NextResponse.json(reports);
}
