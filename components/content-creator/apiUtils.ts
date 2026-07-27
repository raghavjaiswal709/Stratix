// Safely parses a fetch Response as JSON. A plain `res.json()` throws a
// cryptic "Unexpected token 'A', "An error o"... is not valid JSON" the
// moment the server returns anything that isn't JSON — an HTML error page,
// a platform gateway timeout's plain-text body, an empty response — which
// then surfaces to the user as that raw parser error instead of a readable
// message. This reads the body as text first and turns a parse failure into
// a normal, catchable Error with useful context instead.
export async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.trim().replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Server returned an unexpected response (HTTP ${res.status})${snippet ? `: ${snippet}` : ""}`);
  }
}
