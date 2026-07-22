import dbConnect from "@/lib/mongodb";
import { PromptOverrideModel } from "@/lib/models/PromptOverride";
import { getPromptDefinition, PROMPT_DEFINITIONS } from "./definitions";
import type { PromptDefinition } from "./types";
import { renderTemplate } from "./template";

export { renderTemplate } from "./template";

interface OverrideLean {
  key: string;
  content: string;
  updatedAt?: Date;
  updatedBy?: string;
}

/** Returns the effective template for a prompt key — the admin override if one exists, else the hardcoded default. */
export async function getPromptTemplate(key: string): Promise<string> {
  const def = getPromptDefinition(key); // throws on unknown key
  await dbConnect();
  const override = await PromptOverrideModel.findOne({ key }).select("content").lean<OverrideLean | null>();
  return override?.content ?? def.default;
}

/** Fetches the effective template for `key` and substitutes `vars` in one call. */
export async function renderPrompt(key: string, vars: Record<string, string>): Promise<string> {
  const template = await getPromptTemplate(key);
  return renderTemplate(template, vars);
}

export interface PromptListEntry extends PromptDefinition {
  current: string;
  isOverridden: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

/** Full admin listing: every known prompt definition enriched with its live override state. */
export async function listPromptsWithOverrides(): Promise<PromptListEntry[]> {
  await dbConnect();
  const overrides = await PromptOverrideModel.find({}).lean<OverrideLean[]>();
  const overrideMap = new Map(overrides.map((o) => [o.key, o]));

  return PROMPT_DEFINITIONS.map((def) => {
    const override = overrideMap.get(def.key);
    return {
      ...def,
      current: override?.content ?? def.default,
      isOverridden: !!override,
      updatedAt: override?.updatedAt ? new Date(override.updatedAt).toISOString() : undefined,
      updatedBy: override?.updatedBy,
    };
  });
}

export async function savePromptOverride(key: string, content: string, updatedBy: string): Promise<void> {
  getPromptDefinition(key); // throws on unknown key
  await dbConnect();
  await PromptOverrideModel.findOneAndUpdate(
    { key },
    { key, content, updatedAt: new Date(), updatedBy },
    { upsert: true }
  );
}

export async function resetPromptOverride(key: string): Promise<void> {
  getPromptDefinition(key); // throws on unknown key
  await dbConnect();
  await PromptOverrideModel.deleteOne({ key });
}
