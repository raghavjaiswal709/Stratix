/**
 * Pure string templating — no server dependencies, safe to import from
 * client components (unlike lib/prompts/store.ts, which pulls in Mongoose).
 */

/**
 * Replaces every {{TOKEN}} in `template` with the matching entry in `vars`.
 * Uses a replacer function (not a replacement string) so values containing
 * "$" (dollar prices, regex-like text) are never misread as $&/$1 patterns.
 * Unknown tokens are left untouched so a broken edit is visible, not silently blank.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}
