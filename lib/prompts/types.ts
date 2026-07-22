export interface PromptVariable {
  name: string;
  description: string;
}

export type PromptKind = "system" | "user" | "template";

export interface PromptDefinition {
  key: string;
  /** Specific name shown in the admin list, e.g. "Deep AI Analysis — System Prompt". */
  label: string;
  /** Top-level grouping in the admin sidebar. */
  category: string;
  kind: PromptKind;
  /** Source file this prompt is assembled/used in, shown for reference. */
  file: string;
  /** One-line description of when this prompt fires. */
  description: string;
  /** {{TOKEN}} placeholders the render call substitutes — shown as a legend in the editor. */
  variables: PromptVariable[];
  /** Original hardcoded value — restored by "Reset to default". */
  default: string;
}
