import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet } from "../api.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";

// Its own module, mirroring the API's own split. The calendar feed spans two
// subsystems (twin schedules and the source-neutral action ledger), so folding
// it into a feature's own module would tie a cross-cutting read to that
// feature's gate.

const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "IANA zone, e.g. Europe/Paris. Days are civil days in THIS zone, so ask the user which one they mean rather than defaulting to UTC. An unknown zone falls back to UTC instead of failing.",
  );

const calendarInputSchema = z.object({
  from: civilDateSchema.describe("First day of the range, inclusive."),
  to: civilDateSchema.describe("Last day of the range, inclusive."),
  timezone: timeZoneSchema,
});

const calendarDayInputSchema = z.object({
  date: civilDateSchema,
  timezone: timeZoneSchema,
  limit: z.number().int().min(1).max(500).optional(),
});

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "wonda_calendar",
    {
      title: "Wonda Calendar",
      description:
        "What is scheduled and what already ran, per day, over a date range: upcoming twin schedule fires, and past runs and platform actions, in one feed. Use it for 'what is my automation doing this week'.\n\n" +
        "A range returns COUNTS only, aggregated in the database, so a month grid stays small no matter how much work the account has; call wonda_calendar_day for the individual entries.\n\n" +
        "Two axes that must never be added together: counts.run is twin runs, actions is rows in the action ledger. One run performs many platform actions, and an action that ran on the user's own machine through the relay performs no cloud run at all. Under-reporting is stated, not implied: truncated flags a source that hit its enumeration ceiling, making those counts a floor.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: calendarInputSchema,
    },
    async ({ from, to, timezone }) =>
      toolResult(await apiGet("/calendar", { from, to, timezone })),
  );

  server.registerTool(
    "wonda_calendar_day",
    {
      title: "Wonda Calendar Day",
      description:
        "Every entry on one civil day in the requested timezone: each schedule fire and each run, with its time, sender, transport (cloud twin or the user's own machine via relay) and outcome. Use after wonda_calendar to drill into a day.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: calendarDayInputSchema,
    },
    async ({ date, timezone, limit }) =>
      toolResult(
        await apiGet(`/calendar/${encodeURIComponent(date)}`, {
          timezone,
          limit: limit === undefined ? undefined : String(limit),
        }),
      ),
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
