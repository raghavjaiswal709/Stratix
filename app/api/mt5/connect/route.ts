import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";

export const dynamic = "force-dynamic";

const METAAPI_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

/**
 * POST /api/mt5/connect
 * Registers an MT5 account with MetaApi and stores the returned accountId.
 * The password is sent to MetaApi once and NEVER stored.
 *
 * Body: { login: string, password: string, server: string }
 *
 * Returns:
 *   201 → { mt5AccountId: string, state: string }
 *   202 → { pending: true, message: string }  (MetaApi still detecting broker settings)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { login?: string; password?: string; server?: string; transactionId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { login, password, server, transactionId: existingTxId } = body;
    if (!login || !password || !server) {
      return NextResponse.json(
        { error: "login, password, and server are required" },
        { status: 400 }
      );
    }

    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "METAAPI_TOKEN is not configured on the server. Add it to .env.local." },
        { status: 500 }
      );
    }

    // Reuse the caller-supplied transaction-id for 202 retries; generate a new one otherwise.
    const transactionId = existingTxId ?? crypto.randomUUID().replace(/-/g, "");

    const metaHeaders: Record<string, string> = {
      "auth-token": token,
      "Content-Type": "application/json",
      "transaction-id": transactionId,
    };

    let metaRes: Response;
    try {
      metaRes = await fetch(`${METAAPI_BASE}/users/current/accounts`, {
        method: "POST",
        headers: metaHeaders,
        body: JSON.stringify({
          login,
          password,
          name: `Stratix-${login}`,
          server,
          platform: "mt5",
          // cloud-g2 is the current generation (faster, cheaper). "cloud" is not a valid enum value.
          type: "cloud-g2",
          magic: 0,
        }),
      });
    } catch (fetchErr) {
      console.error("[mt5/connect] MetaApi fetch error:", fetchErr);
      return NextResponse.json(
        { error: "Could not reach MetaApi servers. Check your internet connection." },
        { status: 502 }
      );
    }

    // 202 = MetaApi is still auto-detecting broker settings.
    // The client must re-POST the identical request with the same transaction-id
    // after the Retry-After delay — only then will MetaApi return 201 + accountId.
    if (metaRes.status === 202) {
      const retryAfterHeader = metaRes.headers.get("retry-after");
      let retryAfterSeconds = 65; // conservative default
      if (retryAfterHeader) {
        const asNum = parseInt(retryAfterHeader, 10);
        if (!isNaN(asNum)) {
          retryAfterSeconds = asNum + 5; // small buffer
        } else {
          const d = new Date(retryAfterHeader);
          if (!isNaN(d.getTime())) {
            retryAfterSeconds = Math.max(10, Math.ceil((d.getTime() - Date.now()) / 1000) + 5);
          }
        }
      }
      return NextResponse.json(
        { pending: true, transactionId, retryAfterSeconds },
        { status: 202 }
      );
    }

    if (!metaRes.ok) {
      let errBody: {
        message?: string;
        details?: {
          code?: string;
          serversByBrokers?: Record<string, string[]>;
          recommendedResourceSlots?: number;
        } | string;
      } | null = null;
      try {
        errBody = await metaRes.json();
      } catch {
        /* not JSON, handled below */
      }
      console.error(`[mt5/connect] MetaApi error ${metaRes.status}:`, errBody);

      // Build a human-readable error
      let userMessage = errBody?.message ?? `MetaApi returned HTTP ${metaRes.status}`;
      let suggestions: string[] = [];

      // MetaApi sends `details` as either a string code ("E_AUTH") or an object ({ code, ... })
      const code =
        typeof errBody?.details === "string"
          ? errBody.details
          : typeof errBody?.details === "object"
          ? errBody.details?.code
          : undefined;
      if (code === "E_SRV_NOT_FOUND" && typeof errBody?.details === "object") {
        const byBroker = errBody.details?.serversByBrokers;
        if (byBroker) {
          suggestions = Object.values(byBroker).flat();
        }
        userMessage = `Server name not found. Please use one of the exact server names your broker provides.`;
      } else if (code === "E_AUTH") {
        userMessage =
          "Authentication failed — MetaApi could not log in with these credentials. " +
          "Double-check: (1) login is the numeric account number, not your email; " +
          "(2) password is correct; (3) server name is exact (e.g. Deriv-Demo, not 'Demo'). " +
          "Also ensure your MT5 account is not disabled.";
      } else if (code === "E_RESOURCE_SLOTS") {
        const slots =
          typeof errBody?.details === "object" ? errBody.details?.recommendedResourceSlots : undefined;
        userMessage = `This account needs more resources (slots: ${slots ?? "unknown"}). Contact support.`;
      } else if (code === "E_NO_SYMBOLS") {
        userMessage = "No trading symbols found for this account. Contact your broker.";
      } else if (code === "ERR_OTP_REQUIRED") {
        userMessage = "One-time password (OTP) is required. Disable OTP in the MT5 mobile app, then retry.";
      } else if (code === "E_PASSWORD_CHANGE_REQUIRED") {
        userMessage = "Your broker requires a password change. Update it in MT5 first, then retry.";
      } else if (code === "E_TRADING_ACCOUNT_DISABLED") {
        userMessage = "This trading account is disabled. Contact your broker.";
      }

      return NextResponse.json(
        { error: userMessage, suggestions, code },
        { status: metaRes.status }
      );
    }

    let metaData: { id?: string; state?: string };
    try {
      metaData = await metaRes.json();
    } catch {
      return NextResponse.json(
        { error: "MetaApi returned an unexpected response format." },
        { status: 502 }
      );
    }

    if (!metaData.id) {
      console.error("[mt5/connect] MetaApi response missing id:", metaData);
      return NextResponse.json(
        { error: "MetaApi did not return an account ID. Check your credentials and server name." },
        { status: 502 }
      );
    }

    const mt5AccountId = metaData.id;

    // Store in DB — password is intentionally NOT persisted
    await dbConnect();
    await MT5ConfigModel.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: {
          mt5AccountId,
          mt5Login: login,
          mt5Server: server,
          connected: false,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ mt5AccountId, state: metaData.state ?? "CREATED" });
  } catch (err) {
    console.error("[mt5/connect] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error. Check server logs." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mt5/connect
 * Removes the MT5 account from MetaApi and clears the user's MT5 data.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const config = await MT5ConfigModel.findOne({ userId: session.user.id }).lean() as {
    mt5AccountId?: string;
  } | null;

  if (!config?.mt5AccountId) {
    return NextResponse.json({ error: "No MT5 account connected" }, { status: 404 });
  }

  let headers: Record<string, string>;
  try {
    headers = metaApiHeaders();
  } catch {
    return NextResponse.json(
      { error: "Server MetaApi configuration missing" },
      { status: 500 }
    );
  }

  // Remove from MetaApi (best-effort — clear DB regardless)
  try {
    await fetch(
      `${METAAPI_BASE}/users/current/accounts/${config.mt5AccountId}`,
      { method: "DELETE", headers }
    );
  } catch {
    // If MetaApi is unreachable, continue and clean up DB anyway
  }

  await MT5ConfigModel.findOneAndUpdate(
    { userId: session.user.id },
    {
      $unset: {
        mt5AccountId: "",
        mt5Login: "",
        mt5Server: "",
        mt5ConnectedAt: "",
      },
      $set: { connected: false },
    }
  );

  return NextResponse.json({ success: true });
}
