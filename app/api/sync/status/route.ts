import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/sync/status
 * Returns the most recent run for the sync-trades.yml workflow.
 * All GitHub credentials stay server-side only.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_USERNAME;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub configuration missing (GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_REPO)" },
      { status: 500 },
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/sync-trades.yml/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `GitHub API error (${response.status}): ${text}` },
      { status: response.status },
    );
  }

  const data = await response.json();
  const raw: WorkflowRun | undefined = data.workflow_runs?.[0];

  if (!raw) {
    return NextResponse.json({ run: null });
  }

  return NextResponse.json({
    run: {
      id: raw.id,
      status: raw.status,
      conclusion: raw.conclusion,
      html_url: raw.html_url,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    },
  });
}
