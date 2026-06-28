import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost } from "../api.js";

const platformSchema = z.enum(["x", "reddit", "linkedin", "instagram"]);

export function registerTwinTools(server: McpServer): void {
  server.registerTool(
    "twin_seed_from_cookies",
    {
      title: "Seed Twin From Cookies",
      description:
        "Start a cloud twin profile seed job from stored social browser cookies.",
      inputSchema: z.object({
        persona: z.string().min(1),
        platforms: z.array(platformSchema).min(1),
      }),
    },
    async ({ persona, platforms }) => {
      const result = await apiPost(
        `/twin/sessions/${encodeURIComponent(persona)}/profile/seed-from-cookies`,
        { platforms },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "twin_login_automated",
    {
      title: "Automated Twin Login",
      description:
        "Attempt credential-vault login automation for a cloud twin. May return a human view URL.",
      inputSchema: z.object({
        persona: z.string().min(1),
        platform: platformSchema,
      }),
    },
    async ({ persona, platform }) => {
      const result = await apiPost(
        `/twin/sessions/${encodeURIComponent(persona)}/login-automated`,
        { platform },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "twin_login_status",
    {
      title: "Twin Login Status",
      description: "Check a cloud twin's advisory platform login status.",
      inputSchema: z.object({
        persona: z.string().min(1),
        platform: platformSchema,
      }),
    },
    async ({ persona, platform }) => {
      const result = await apiGet(
        `/twin/sessions/${encodeURIComponent(persona)}/login-status`,
        { platform },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "twin_needs_auth_view",
    {
      title: "Twin Needs Auth View",
      description:
        "Flag a cloud twin as needing re-authentication, then mint an existing streamed view URL.",
      inputSchema: z.object({
        persona: z.string().min(1),
        platform: platformSchema.optional(),
      }),
    },
    async ({ persona, platform }) => {
      const needsAuth = await apiPost("/twin/needs-auth", {
        persona,
        platform,
      });
      if (!needsAuth.ok) return toolResult(needsAuth);
      const view = await apiPost(`/twin/view/${encodeURIComponent(persona)}`, {
        platform,
      });
      return toolResult(
        view.ok
          ? { ok: true, data: { needsAuth: needsAuth.data, view: view.data } }
          : view,
      );
    },
  );
}

function toolResult(result: { ok: boolean; data?: unknown; error?: string }) {
  if (!result.ok) {
    return {
      content: [
        { type: "text" as const, text: result.error ?? "request failed" },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
  };
}
