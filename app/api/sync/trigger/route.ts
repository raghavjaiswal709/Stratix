import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/trigger
 * Reads the calling user's MetaApi accountId from the DB, then fires a
 * workflow_dispatch event on sync-trades.yml passing it as the `account_id` input.
 * All GitHub and MetaApi credentials stay server-side only.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const config = await MT5ConfigModel.findOne({ userId: session.user.id }).lean() as {
    mt5AccountId?: string;
    connected?: boolean;
  } | null;

  if (!config?.mt5AccountId || !config.connected) {
    return NextResponse.json(
      { error: "MT5 account not connected. Please connect your MT5 account first." },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_USERNAME;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_REF ?? "main";

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub configuration missing (GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/sync-trades.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: { account_id: config.mt5AccountId },
      }),
    }
  );

  // 204 No Content = success
  if (response.status === 204) {
    return NextResponse.json({ success: true });
  }

  const text = await response.text();
  return NextResponse.json(
    { error: `GitHub API error (${response.status}): ${text}` },
    { status: response.status }
  );
}
