// "Auto (recommended)" is the Style dropdown's sentinel for "omit this line
// entirely and let the template's own auto-selection logic apply" — filtered
// out here alongside blank/undefined fields.
export function buildPrompt(
  template: string,
  params: Record<string, string | number | undefined>
): string {
  const lines = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== "Auto (recommended)")
    .map(([key, v]) => `${key}: ${v}`);
  return `${template}\n\n${lines.join("\n")}`;
}
