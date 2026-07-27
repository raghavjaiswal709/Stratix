// Nano-banana / Gemini 2.5 Flash Image — Google's free-tier-eligible native
// image model. Overridable via env in case a newer Gemini image model
// replaces it later without needing a code change.
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// The free tier's per-minute request cap is tight enough that firing a
// batch of images back-to-back routinely trips it even when the daily
// quota still has headroom — so a 429 here gets a few retries with the
// delay Google itself asks for, rather than being treated as a hard
// failure on the first bump.
const MAX_RATE_LIMIT_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Google's 429 body includes a RetryInfo detail with the delay it wants
// callers to wait (e.g. "13s") — honor that instead of guessing.
function parseRetryDelayMs(errorText: string): number | null {
  try {
    const parsed = JSON.parse(errorText);
    const details: Array<Record<string, unknown>> = parsed?.error?.details ?? [];
    const retryInfo = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
    const retryDelay = typeof retryInfo?.retryDelay === "string" ? retryInfo.retryDelay : null;
    if (!retryDelay) return null;
    const seconds = parseFloat(retryDelay.replace(/s$/, ""));
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

// Calls Gemini's image-generation model for one poster's imagePrompt and
// returns the result as a data: URL — the same shape the manual
// file-upload path already produces (see ContentCreatorPage.processImageFile),
// so nothing downstream (canvas rendering, history persistence, export)
// needs to know the image came from Gemini rather than a user upload.
export async function generateImageDataUrl(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const errorText = await response.text().catch(() => "");
      const delay = parseRetryDelayMs(errorText) ?? DEFAULT_RETRY_DELAY_MS * (attempt + 1);
      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Gemini image API HTTP ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const parts: Array<{ inlineData?: { mimeType?: string; data?: string } }> = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new Error("Gemini returned no image data for this prompt");
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    return `data:${mimeType};base64,${imagePart.inlineData.data}`;
  }
}
