import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import { WRITE_TOOL_ANNOTATIONS } from "./annotations.js";

const MAX_DURATION_MS = 180_000;
const DEFAULT_DURATION_MS = 120_000;
const ENGAGE_COMMENTERS_DEFAULT_DURATION_MS = 180_000;

const platformSchema = z.enum(["linkedin", "reddit", "x", "instagram"]);
const campaignActionSchema = z.enum(["feed-engage", "engage-commenters"]);
const taskKindSchema = z.enum(["saved_sync", "engage", "agent"]);
const scheduleModeSchema = z.enum(["deterministic", "agent"]);
const agentProviderSchema = z.enum(["anthropic", "openrouter"]);

const textSchema = z.string().trim().min(1).max(10_000);
const shortTextSchema = z.string().trim().min(1).max(512);
const targetSchema = z.string().trim().min(1).max(2_048);
const ENGAGE_COMMENTERS_ACTIONS = ["like", "reply", "connect"] as const;
const authorsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(256)
      .refine((value) => !/[\0\r\n]/.test(value)),
  )
  .min(1)
  .max(50);

const feedEngagePayloadSchema = z
  .object({
    authors: authorsSchema.optional(),
    keywords: z.array(shortTextSchema).min(1).max(50).optional(),
    subreddits: z.array(shortTextSchema).min(1).max(25).optional(),
    reply: z.boolean().default(false),
    replyStyle: textSchema.optional(),
    personaReply: textSchema.optional(),
    relevanceThreshold: z.number().min(0).max(1).optional(),
    relevancePrompt: textSchema.optional(),
    maxReply: z.number().int().positive().max(25).optional(),
    perDayCap: z.number().int().positive().max(100).optional(),
    maxScan: z.number().int().positive().max(500).optional(),
    dryRun: z.boolean().default(false),
    durationMs: z
      .number()
      .int()
      .positive()
      .max(MAX_DURATION_MS)
      .default(DEFAULT_DURATION_MS),
    maxEngage: z.literal(1).default(1),
    reactions: z
      .array(
        z
          .string()
          .transform((value) => value.trim().toLowerCase())
          .pipe(
            z.enum([
              "like",
              "love",
              "celebrate",
              "support",
              "insightful",
              "funny",
            ]),
          ),
      )
      .min(1)
      .max(20)
      .optional(),
    expandPosts: z.boolean().default(true),
    engageComments: z.boolean().default(false),
    engageCommentsFrom: z.enum(["authors", "any"]).default("authors"),
    maxCommentEngage: z.number().int().positive().max(25).optional(),
    navigate: z.literal("never").default("never"),
    scrollMode: z.literal("manual").default("manual"),
    scanIntervalMs: z.number().int().min(250).max(5000).optional(),
  })
  .strict();

const engageCommentersActionsSchema = z
  .array(z.enum(ENGAGE_COMMENTERS_ACTIONS))
  .min(1)
  .max(3)
  .transform((actions) =>
    ENGAGE_COMMENTERS_ACTIONS.filter((action) => actions.includes(action)),
  );

const engageCommentersPayloadSchema = z
  .object({
    post: targetSchema,
    actions: engageCommentersActionsSchema.default(["like"]),
    replyText: textSchema.optional(),
    connectNote: textSchema.optional(),
    maxCommenters: z.number().int().positive().max(25).default(25),
    durationMs: z
      .number()
      .int()
      .positive()
      .max(MAX_DURATION_MS)
      .default(ENGAGE_COMMENTERS_DEFAULT_DURATION_MS),
    dryRun: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.actions.includes("reply") && !value.replyText?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "replyText is required when actions includes reply",
      });
    }
  });

const runCampaignInputSchema = z
  .object({
    persona: z.string().min(1).describe("Cloud twin persona"),
    platform: platformSchema.describe("Platform that owns the campaign verb"),
    action: campaignActionSchema.describe("Autonomous-loop registry verb"),
    payload: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Campaign payload, validated against the selected verb"),
  })
  .superRefine((value, ctx) => {
    validateCampaignPayload(value, ctx);
  });

const scheduleLoopInputSchema = z.object({
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

export function registerCampaignTools(server: McpServer): void {
  server.registerTool(
    "run_campaign",
    {
      title: "Run Campaign",
      description:
        "Run one bounded autonomous twin campaign. Approve once; the twin runs the loop autonomously and self-paces under daily caps.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: runCampaignInputSchema,
    },
    async (args) => {
      const parsed = runCampaignInputSchema.parse(args);
      const payload = parseCampaignPayload(parsed);
      const result = await apiPost(
        `/twin/sessions/${encodeURIComponent(parsed.persona)}/actions/${parsed.platform}/${parsed.action}`,
        payload,
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "schedule_loop",
    {
      title: "Schedule Loop",
      description:
        "Create a recurring autonomous twin loop. Approve once; cron fans it out on cadence under the same server-side caps.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: scheduleLoopInputSchema,
    },
    async (args) => toolResult(await apiPost("/twin/schedules", args)),
  );
}

function parseCampaignPayload(value: {
  platform?: z.infer<typeof platformSchema>;
  action?: z.infer<typeof campaignActionSchema>;
  payload?: Record<string, unknown>;
}) {
  if (value.action === undefined || value.payload === undefined) {
    throw new Error("campaign action and payload are required");
  }

  if (value.action === "engage-commenters") {
    return engageCommentersPayloadSchema.parse(value.payload);
  }

  return feedEngagePayloadSchema.parse(value.payload);
}

function validateCampaignPayload(
  value: {
    platform?: z.infer<typeof platformSchema>;
    action?: z.infer<typeof campaignActionSchema>;
    payload?: Record<string, unknown>;
  },
  ctx: z.RefinementCtx,
) {
  if (
    value.platform === undefined ||
    value.action === undefined ||
    value.payload === undefined
  ) {
    return;
  }

  if (value.action === "engage-commenters") {
    if (value.platform !== "linkedin") {
      ctx.addIssue({
        code: "custom",
        path: ["platform"],
        message: "engage-commenters is only available on linkedin",
      });
      return;
    }

    addPayloadIssues(
      engageCommentersPayloadSchema.safeParse(value.payload),
      ctx,
    );
    return;
  }

  validateFeedEngagePlatformRules(
    { platform: value.platform, payload: value.payload },
    ctx,
  );
  addPayloadIssues(feedEngagePayloadSchema.safeParse(value.payload), ctx);
}

function validateFeedEngagePlatformRules(
  value: {
    platform: z.infer<typeof platformSchema>;
    payload: Record<string, unknown>;
  },
  ctx: z.RefinementCtx,
) {
  const hasAuthors = checkHasNonEmptyArray(value.payload.authors);
  const hasKeywords = checkHasNonEmptyArray(value.payload.keywords);

  if (!hasAuthors && !hasKeywords) {
    ctx.addIssue({
      code: "custom",
      path: ["payload"],
      message: "authors or keywords are required",
    });
  }
  if (hasAuthors && hasKeywords) {
    ctx.addIssue({
      code: "custom",
      path: ["payload"],
      message: "authors and keywords cannot be combined",
    });
  }
  if (hasKeywords && value.payload.engageComments === true) {
    ctx.addIssue({
      code: "custom",
      path: ["payload", "engageComments"],
      message: "engageComments is not supported with keywords",
    });
  }
  if (value.platform === "instagram" && hasKeywords) {
    ctx.addIssue({
      code: "custom",
      path: ["payload", "keywords"],
      message: "instagram feed-engage requires authors",
    });
  }
}

function addPayloadIssues(
  result: ReturnType<
    | typeof feedEngagePayloadSchema.safeParse
    | typeof engageCommentersPayloadSchema.safeParse
  >,
  ctx: z.RefinementCtx,
) {
  if (result.success) return;

  for (const issue of result.error.issues) {
    ctx.addIssue({
      ...issue,
      path: ["payload", ...issue.path],
    });
  }
}

function checkHasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
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
