import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export type TwinActionKind = "read" | "write";

export const READ_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
};

export const WRITE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
};

export function annotationsForTwinActionKind(
  kind: TwinActionKind,
): ToolAnnotations {
  return kind === "read" ? READ_TOOL_ANNOTATIONS : WRITE_TOOL_ANNOTATIONS;
}
