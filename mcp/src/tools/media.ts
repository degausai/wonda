import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiUpload } from "../api.js";

export function registerMediaTools(server: McpServer): void {
  server.registerTool(
    "upload_media",
    {
      title: "Upload Media",
      description:
        "Upload media from a URL. Downloads the file and uploads it to your Wonda media library. Returns a mediaId for use in other tools.",
      inputSchema: z.object({
        url: z.string().url().describe("URL of the file to upload"),
      }),
    },
    async ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return {
            content: [
              { type: "text", text: "Only http and https URLs are supported" },
            ],
            isError: true,
          };
        }

        const downloadResponse = await fetch(url);
        if (!downloadResponse.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to download file from URL: HTTP ${downloadResponse.status}`,
              },
            ],
            isError: true,
          };
        }

        const blob = await downloadResponse.blob();
        const contentType =
          downloadResponse.headers.get("content-type") ??
          "application/octet-stream";
        const filename = parsed.pathname.split("/").pop() || "upload";

        const formData = new FormData();
        formData.append(
          "file",
          new File([blob], filename, { type: contentType }),
        );

        const result = await apiUpload("/media/upload", formData);
        if (!result.ok)
          return {
            content: [{ type: "text", text: result.error }],
            isError: true,
          };
        return {
          content: [{ type: "text", text: JSON.stringify(result.data) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_media",
    {
      title: "Get Media",
      description: "Get metadata for a specific media item by ID.",
      inputSchema: z.object({
        mediaId: z.string().min(1).describe("Media ID"),
      }),
    },
    async ({ mediaId }) => {
      const result = await apiGet(`/media/${mediaId}`);
      if (!result.ok)
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    },
  );

  server.registerTool(
    "list_media",
    {
      title: "List Media",
      description:
        "List media in the account library. Filter by kind and source.",
      inputSchema: z.object({
        kind: z
          .enum(["image", "video", "audio"])
          .optional()
          .describe("Filter by media kind"),
        source: z
          .enum([
            "user_upload",
            "model_generated",
            "editor_output",
            "scrape",
            "import",
          ])
          .optional()
          .describe("Filter by source"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results (default 20)"),
      }),
    },
    async (params) => {
      const query: Record<string, string | undefined> = {
        kind: params.kind,
        source: params.source,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      };
      const result = await apiGet("/media", query);
      if (!result.ok)
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    },
  );
}
