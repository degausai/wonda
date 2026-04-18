import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";

type EditEndpoint = {
  name: string;
  title: string;
  description: string;
  path: string;
};

const EDIT_ENDPOINTS: EditEndpoint[] = [
  {
    name: "edit_video",
    title: "Edit Video",
    description:
      "Run a video editor operation (animatedCaptions, textOverlay, editAudio, merge, overlay, splitScreen, trim, speed, etc.). Returns an editorJobId — poll with get_editor_job until succeeded.",
    path: "/video/edit",
  },
  {
    name: "edit_image",
    title: "Edit Image",
    description:
      "Run an image editor operation (imageCrop, textOverlay). Returns an editorJobId — poll with get_editor_job until succeeded.",
    path: "/image/edit",
  },
  {
    name: "edit_audio",
    title: "Edit Audio",
    description:
      "Run an audio editor operation (audioTrim). Returns an editorJobId — poll with get_editor_job until succeeded.",
    path: "/audio/edit",
  },
];

const editInputSchema = z.object({
  operation: z
    .string()
    .min(1)
    .describe("Operation name (e.g. animatedCaptions, trim, merge)"),
  mediaIds: z.array(z.string()).optional().describe("Input media IDs"),
  audioMediaId: z
    .string()
    .optional()
    .describe("Audio media ID (for editAudio operation)"),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Operation-specific parameters"),
  promptText: z
    .string()
    .optional()
    .describe("Prompt text for AI-driven operations"),
});

export function registerEditTools(server: McpServer): void {
  for (const endpoint of EDIT_ENDPOINTS) {
    server.registerTool(
      endpoint.name,
      {
        title: endpoint.title,
        description: endpoint.description,
        inputSchema: editInputSchema,
      },
      async (args) => {
        const result = await apiPost(endpoint.path, args);
        if (!result.ok)
          return {
            content: [{ type: "text", text: result.error }],
            isError: true,
          };
        return {
          content: [{ type: "text", text: JSON.stringify(result.data) }],
        };
      },
    );
  }
}
