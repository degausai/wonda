import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";

export function registerPublishTools(server: McpServer): void {
  server.registerTool(
    "publish_instagram",
    {
      title: "Publish to Instagram",
      description:
        "Publish a media item to Instagram. Requires a connected Instagram account. Returns an outputJobId — poll with get_publish_job until succeeded.",
      inputSchema: z.object({
        mediaId: z.string().min(1).describe("Media ID to publish"),
        instagramAccountId: z
          .string()
          .uuid()
          .describe("Instagram account ID (from GET /instagram/accounts)"),
        caption: z.string().optional().describe("Post caption"),
        altText: z.string().optional().describe("Alt text for accessibility"),
        product: z
          .enum(["IMAGE", "REELS", "STORIES"])
          .optional()
          .describe("Instagram product type"),
        shareToFeed: z.boolean().optional().describe("Share Reel to feed"),
      }),
    },
    async (args) => {
      const result = await apiPost("/publish/instagram", args);
      if (!result.ok)
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    },
  );

  server.registerTool(
    "publish_tiktok",
    {
      title: "Publish to TikTok",
      description:
        "Publish a video to TikTok. Requires a connected TikTok account. Returns an outputJobId — poll with get_publish_job until succeeded.",
      inputSchema: z.object({
        mediaId: z.string().min(1).describe("Media ID to publish"),
        tiktokAccountId: z
          .string()
          .uuid()
          .describe("TikTok account ID (from GET /tiktok/accounts)"),
        caption: z.string().optional().describe("Post caption"),
        privacyLevel: z
          .string()
          .optional()
          .describe("Privacy level (e.g. PUBLIC_TO_EVERYONE)"),
        isAigc: z.boolean().optional().describe("Mark as AI-generated content"),
        postMode: z.enum(["direct", "inbox"]).optional().describe("Post mode"),
      }),
    },
    async (args) => {
      const result = await apiPost("/publish/tiktok", args);
      if (!result.ok)
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    },
  );
}
