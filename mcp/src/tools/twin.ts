import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api.js";
import {
  READ_TOOL_ANNOTATIONS,
  WRITE_TOOL_ANNOTATIONS,
} from "./annotations.js";

const platformSchema = z.enum(["x", "reddit", "linkedin", "instagram"]);
const provenanceSchema = z.enum(["born_in_cloud", "synced_local"]);
const twinStatusSchema = z.enum(["active", "paused"]);
const taskKindSchema = z.enum(["saved_sync", "engage", "agent"]);
const scheduleModeSchema = z.enum(["deterministic", "agent"]);
const agentProviderSchema = z.enum(["anthropic", "openrouter"]);
const limitsModeSchema = z.enum([
  "warmup",
  "conservative_steady",
  "moderate_max",
  "unlimited",
]);

const provisionTwinInputSchema = z.object({
  persona: z.string().min(1),
  region: z.string().min(1),
  provenance: provenanceSchema.optional(),
  spendCapMicrodollars: z.number().int().min(0).optional(),
  maxWritesPerHour: z.number().int().min(0).optional(),
  allowedCommands: z.array(z.string()).optional(),
  alertWebhookUrl: z.string().url().optional(),
  alertWebhookSecret: z.string().min(1).max(512).optional(),
});

const personaInputSchema = z.object({
  persona: z.string().min(1),
});

const listTwinRunsInputSchema = z.object({
  persona: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
});

const scheduleInputSchema = z.object({
  persona: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  cron: z.string().min(1),
  taskKind: taskKindSchema,
  command: z.string().optional(),
  commands: z.array(z.string()).optional(),
  commandArgv: z.array(z.string()).optional(),
  commandsArgv: z.array(z.array(z.string())).optional(),
  mode: scheduleModeSchema.optional(),
  prompt: z.string().optional(),
  agentProvider: agentProviderSchema.optional(),
  agentModel: z.string().optional(),
  jitterWindowSeconds: z.number().int().min(0).max(86_400).optional(),
  outputWebhookUrl: z.string().url().optional(),
  outputWebhookSecret: z.string().min(1).max(512).optional(),
});

const updateScheduleInputSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  jitterWindowSeconds: z
    .number()
    .int()
    .min(0)
    .max(86_400)
    .nullable()
    .optional(),
  outputWebhookUrl: z.string().url().nullable().optional(),
  outputWebhookSecret: z.string().min(1).max(512).nullable().optional(),
});

const limitOverridesSchema = z.object({
  globalDaily: z.number().int().positive().optional(),
  actionDaily: z.record(z.string(), z.number().int().positive()).optional(),
  actionWeekly: z.record(z.string(), z.number().int().positive()).optional(),
});

export function registerTwinTools(server: McpServer): void {
  server.registerTool(
    "provision_twin",
    {
      title: "Provision Twin",
      description: "Provision or connect a cloud twin profile.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: provisionTwinInputSchema,
    },
    async (args) => toolResult(await apiPost("/twin/sessions", args)),
  );

  server.registerTool(
    "list_twins",
    {
      title: "List Twins",
      description: "List cloud twins for the current account.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => toolResult(await apiGet("/twin/sessions")),
  );

  server.registerTool(
    "show_twin",
    {
      title: "Show Twin",
      description: "Get one cloud twin by persona.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(await apiGet(`/twin/sessions/${encodeURIComponent(persona)}`)),
  );

  server.registerTool(
    "pause_twin",
    {
      title: "Pause Twin",
      description: "Pause a cloud twin.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(
        await apiPatch(`/twin/sessions/${encodeURIComponent(persona)}`, {
          status: "paused",
        }),
      ),
  );

  server.registerTool(
    "resume_twin",
    {
      title: "Resume Twin",
      description: "Resume a paused cloud twin.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(
        await apiPatch(`/twin/sessions/${encodeURIComponent(persona)}`, {
          status: "active",
        }),
      ),
  );

  server.registerTool(
    "update_twin",
    {
      title: "Update Twin",
      description:
        "Update a cloud twin status, permission profile, spend cap, or write limit.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        status: twinStatusSchema.optional(),
        spendCapMicrodollars: z.number().int().min(0).nullable().optional(),
        maxWritesPerHour: z.number().int().min(0).nullable().optional(),
        allowedCommands: z.array(z.string()).optional(),
        alertWebhookUrl: z.string().url().nullable().optional(),
        alertWebhookSecret: z.string().min(1).max(512).nullable().optional(),
      }),
    },
    async ({ persona, ...body }) =>
      toolResult(
        await apiPatch(`/twin/sessions/${encodeURIComponent(persona)}`, body),
      ),
  );

  server.registerTool(
    "run_now_twin",
    {
      title: "Run Twin Now",
      description: "Trigger an on-demand twin run.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        command: z.string().optional(),
      }),
    },
    async ({ persona, command }) =>
      toolResult(
        await apiPost(`/twin/sessions/${encodeURIComponent(persona)}/run-now`, {
          command,
        }),
      ),
  );

  server.registerTool(
    "twin_can_act",
    {
      title: "Twin Can Act",
      description: "Check whether a cloud twin can run an action right now.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        action: z.string().optional(),
      }),
    },
    async ({ persona, action }) =>
      toolResult(
        await apiGet(`/twin/sessions/${encodeURIComponent(persona)}/can-act`, {
          action,
        }),
      ),
  );

  server.registerTool(
    "twin_action_allowance",
    {
      title: "Twin Action Allowance",
      description: "Get per-action allowance and usage for a cloud twin.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(
        await apiGet(`/twin/sessions/${encodeURIComponent(persona)}/actions`),
      ),
  );

  server.registerTool(
    "twin_health",
    {
      title: "Twin Health",
      description: "Get liveness and ban-signal health for a cloud twin.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(
        await apiGet(`/twin/sessions/${encodeURIComponent(persona)}/health`),
      ),
  );

  server.registerTool(
    "twin_limits",
    {
      title: "Twin Limits",
      description: "Get action-cap mode and custom overrides for a cloud twin.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: personaInputSchema,
    },
    async ({ persona }) =>
      toolResult(
        await apiGet(`/twin/sessions/${encodeURIComponent(persona)}/limits`),
      ),
  );

  server.registerTool(
    "set_twin_limits",
    {
      title: "Set Twin Limits",
      description: "Set action-cap mode and custom overrides for a cloud twin.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        mode: limitsModeSchema.optional(),
        overrides: limitOverridesSchema.optional(),
      }),
    },
    async ({ persona, mode, overrides }) =>
      toolResult(
        await apiPut(`/twin/sessions/${encodeURIComponent(persona)}/limits`, {
          mode,
          overrides,
        }),
      ),
  );

  server.registerTool(
    "list_twin_runs",
    {
      title: "List Twin Runs",
      description: "List recent twin audit runs.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: listTwinRunsInputSchema,
    },
    async ({ persona, limit }) =>
      toolResult(
        await apiGet("/twin/runs", {
          persona,
          limit: limit === undefined ? undefined : String(limit),
        }),
      ),
  );

  server.registerTool(
    "get_twin_output",
    {
      title: "Get Twin Output",
      description: "Get a presigned download URL for a twin run's output.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        runId: z.string().min(1),
      }),
    },
    async ({ runId }) =>
      toolResult(
        await apiGet(`/twin/runs/${encodeURIComponent(runId)}/output`),
      ),
  );

  server.registerTool(
    "cancel_twin_run",
    {
      title: "Cancel Twin Run",
      description: "Cancel a twin run.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        runId: z.string().min(1),
      }),
    },
    async ({ runId }) =>
      toolResult(
        await apiPost(`/twin/runs/${encodeURIComponent(runId)}/cancel`),
      ),
  );

  server.registerTool(
    "list_twin_schedules",
    {
      title: "List Twin Schedules",
      description: "List cloud twin schedules.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1).optional(),
      }),
    },
    async ({ persona }) =>
      toolResult(await apiGet("/twin/schedules", { persona })),
  );

  server.registerTool(
    "create_twin_schedule",
    {
      title: "Create Twin Schedule",
      description: "Create a cloud twin schedule.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: scheduleInputSchema,
    },
    async (args) => toolResult(await apiPost("/twin/schedules", args)),
  );

  server.registerTool(
    "update_twin_schedule",
    {
      title: "Update Twin Schedule",
      description: "Enable, disable, or edit a cloud twin schedule.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: updateScheduleInputSchema,
    },
    async ({ id, ...body }) =>
      toolResult(
        await apiPatch(`/twin/schedules/${encodeURIComponent(id)}`, body),
      ),
  );

  server.registerTool(
    "delete_twin_schedule",
    {
      title: "Delete Twin Schedule",
      description: "Delete a cloud twin schedule.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        id: z.string().min(1),
      }),
    },
    async ({ id }) =>
      toolResult(await apiDelete(`/twin/schedules/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "twin_seed_from_cookies",
    {
      title: "Seed Twin From Cookies",
      description:
        "Start a cloud twin profile seed job from stored social browser cookies.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        platforms: z.array(platformSchema).min(1),
      }),
    },
    async ({ persona, platforms }) =>
      toolResult(
        await apiPost(
          `/twin/sessions/${encodeURIComponent(persona)}/profile/seed-from-cookies`,
          { platforms },
        ),
      ),
  );

  server.registerTool(
    "twin_login_automated",
    {
      title: "Automated Twin Login",
      description:
        "Attempt credential-vault login automation for a cloud twin. Cloud-twin " +
        "login is human-gated: when the vault flow cannot finish safely, this " +
        "returns { status: 'needs_human', viewerUrl }. Give the viewerUrl to the " +
        "user to open in a browser and complete the sign-in; you cannot log in " +
        "for them. Re-check with twin_login_status afterwards.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        platform: platformSchema,
      }),
    },
    async ({ persona, platform }) =>
      toolResult(
        await apiPost(
          `/twin/sessions/${encodeURIComponent(persona)}/login-automated`,
          { platform },
        ),
      ),
  );

  server.registerTool(
    "twin_login_status",
    {
      title: "Twin Login Status",
      description: "Check a cloud twin's advisory platform login status.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: z.string().min(1),
        platform: platformSchema,
      }),
    },
    async ({ persona, platform }) =>
      toolResult(
        await apiGet(
          `/twin/sessions/${encodeURIComponent(persona)}/login-status`,
          { platform },
        ),
      ),
  );

  server.registerTool(
    "twin_needs_auth_view",
    {
      title: "Twin Needs Auth (re-login)",
      description:
        "Flag a cloud twin as needing re-authentication and mint a hosted LOGIN " +
        "session for it. Returns { needsAuth, login: { viewerUrl, wsUrl, runId, " +
        "expiresAt } }. Give login.viewerUrl to the user to open in a browser and " +
        "sign in; on sign-in the twin flips back to active (this uses the login " +
        "flow, not view, so it actually clears needs_auth). Use this for a signed-" +
        "out twin. Token expires in ~20 min (call again for a fresh one); only one " +
        "twin can be logged in at a time, so do them sequentially.",
      annotations: WRITE_TOOL_ANNOTATIONS,
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

      // Login flow (kind:login), NOT view: the view flow snapshots but never
      // clears needs_auth, so a re-login via /twin/view leaves the twin flagged.
      const login = await apiPost(
        `/twin/login/${encodeURIComponent(persona)}`,
        { platform },
      );
      return toolResult(
        login.ok
          ? { ok: true, data: { needsAuth: needsAuth.data, login: login.data } }
          : login,
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
