import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api.js";
import {
  READ_TOOL_ANNOTATIONS,
  WRITE_TOOL_ANNOTATIONS,
} from "./annotations.js";

// The sequencer, as an MCP surface. This IS the product surface for these users:
// they are Claude Cowork and plain Claude, not a terminal.
//
// Design rules that shaped the tool list:
//   * FEW tools. Nine, and each one is a whole user intention ("author it",
//     "check it", "run it", "how is it going"), not a table operation.
//   * The VOCABULARY lives in the descriptions. An LLM writing a definition has
//     no schema to read, so sequence_validate and sequence_create both carry the
//     complete step grammar with a worked example. Getting it right first try is
//     the whole design goal.
//   * VALIDATE IS FREE AND SAFE. It stores nothing, runs nothing and answers 200
//     even for a broken definition, with one fixable issue per problem. The
//     intended loop is compose -> validate -> fix -> create.
//   * A run STARTS and RETURNS. Steps land minutes to days apart, so nothing here
//     blocks; sequence_runs is how you find out what happened.

// The one block of prose that has to teach the whole language. Repeated verbatim
// in the two tools that accept a definition, because an agent reading only one
// of them still has to get it right.
const STEP_VOCABULARY = `A definition is {"version": 1, "steps": [...]}. There are exactly FOUR step kinds and no others:

1. RUN: one wonda command, as an argv array. Give it an "id" if a later step needs its output.
   {"id": "check", "run": ["linkedin", "conversations", "--account", "{{vars.persona}}", "--json"]}
   Add --json to any step whose output you plan to read. One argv per step, never a batch.

2. WAIT: a pause. "3d" is exact; "3d ± 6h" is 3 days give or take 6 hours; "1d-2d" and {"min":"1d","max":"2d"} are ranges. Units: s, m, h, d, w, and compounds like "1h30m". A range is sampled once against a persisted step-entry instant, so retries and restarts keep the same due time. Prefer a range over an exact duration: identical timing every day is what a platform notices.
   {"wait": "3d ± 6h"}

3. IF: a branch. "then" is required, "else" is optional, and both hold ordinary steps.
   {"if": "{{steps.check.unread}} == 0", "then": [ ... ], "else": [ ... ]}
   Operators: == != > >= < <= contains, "not contains", matches (safe regex), "is empty", "is not empty", joined with and / or. AND has normal precedence over OR and evaluation short-circuits. There are no platform-semantic predicates such as is_connected or has_replied: read the platform with a RUN step and branch on its output.

4. EACH: fan-out. Run "body" once per item of a set an earlier step returned: posts, profiles, notifications, files, or any other array.
   {"each": {"over": "{{steps.found.profiles}}", "as": "profile", "body": [ ... ]}}
   "over" must be ONE whole reference to an array (or a literal array written into the definition). If it resolves to anything else the run fails saying so; it is never treated as an empty set. An empty array is fine and simply runs the body zero times.
   Inside the body, {{item}} is the current item and {{item.<field>}} walks into it. "as" binds a second name for the same value ({{profile.url}}), which is how a nested fan-out still reaches the outer item. A step id inside the body belongs to that item's iteration: it is readable by later steps of the SAME item and by nothing after the loop.
   Items run one at a time, in order. If one item's step fails, the rest of that item is skipped, the failure is recorded, and the next item runs; add "onItemError": "fail" to stop the whole run at the first one instead. Give the each an "id" and its progress is readable as {{steps.<id>}}: {"total": 50, "completed": 12, "failed": [...]}.
   Fan-out defaults to at most 500 items. Set "maxItems" explicitly to raise it, up to 5,000. The run also has a 10,000-command hard backstop. Limits fail clearly and never silently truncate the set.

TEMPLATES. {{vars.name}} is a value supplied when the run starts, so ONE sequence serves many targets. {{steps.<id>.<field>}} is an earlier step's parsed --json output, and dotted paths walk into it ({{steps.search.results.0.url}}). {{item}} and any "as" alias exist inside an each body. A reference that does not resolve FAILS with the available keys listed; it never substitutes an empty string.

THERE IS STILL NO per-person state, no campaign and no list. A run is the unit of state; a fan-out is a loop inside one run, not an enrollment.

WORKED EXAMPLE A (publish on X, wait with spacing, then inspect its analytics):
{"version": 1, "steps": [
  {"id": "published", "run": ["x", "tweet", "{{vars.text}}", "--json"]},
  {"wait": "2h ± 15m"},
  {"id": "analytics", "run": ["x", "analytics", "{{steps.published.id}}", "--json"]}
]}

WORKED EXAMPLE B (search for profiles, enrich each one, and connect only with the founders):
{"version": 1, "steps": [
  {"id": "found", "run": ["linkedin", "search", "{{vars.query}}", "--count", "50", "--json"]},
  {"id": "outreach", "each": {
    "over": "{{steps.found.profiles}}",
    "as": "profile",
    "body": [
      {"id": "enriched", "run": ["linkedin", "enrich", "{{item.url}}", "--json"]},
      {"if": "{{steps.enriched.headline}} contains founder", "then": [
        {"run": ["linkedin", "connect", "{{profile.url}}", "--message", "hi {{item.name}}"]}
      ]},
      {"wait": "3m-9m"}
    ]
  }}
]}`;

const definitionSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'The sequence definition object: {"version": 1, "steps": [...]}. See the tool description for the full step vocabulary.',
  );

const personaSchema = z
  .string()
  .min(1)
  .max(64)
  .describe(
    "The Wonda identity the steps run as (the twin persona, e.g. maddie). Every write consumes THIS identity's daily action budget.",
  );

const transportSchema = z
  .enum(["auto", "cloud", "relay"])
  .describe(
    "Where the steps run. Leave it out (auto) unless the user asked: auto follows their plan, but moves to their own Mac when the flow includes a real local-only LinkedIn, Sales Navigator, X or Reddit command. A run snapshots one target and never migrates mid-flight; if the Mac is closed the step waits.",
  );

export function registerSequenceTools(server: McpServer): void {
  server.registerTool(
    "sequence_validate",
    {
      title: "Validate a Wonda sequence",
      description:
        "Check a sequence definition WITHOUT storing or running anything. Answers 200 even when the definition is broken, with one fixable issue per problem (each carrying the path of the offending step), plus the {{vars.*}} the definition needs and the ids that produce output.\n\n" +
        "Call this before sequence_create, every time, and fix until valid is true. It is free and it has no side effects.\n\n" +
        STEP_VOCABULARY,
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ definition: definitionSchema }),
    },
    async ({ definition }) =>
      toolResult(await apiPost("/sequences/validate", { definition })),
  );

  server.registerTool(
    "sequence_create",
    {
      title: "Create a Wonda sequence",
      description:
        "Store a sequence: ordered steps of any wonda platform command, with waits and branches between them, bound to one identity.\n\n" +
        "NO TRIGGER IS ATTACHED. A sequence created here runs only when something runs it (sequence_run). If the user wants it to fire on its own, that is a separate, explicit sequence_schedule call. Do not attach one unless they asked.\n\n" +
        "Validate first with sequence_validate. A definition with problems is rejected with the same issue list, so there is no reason to guess.\n\n" +
        STEP_VOCABULARY,
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: personaSchema,
        name: z
          .string()
          .min(1)
          .max(120)
          .describe("A short human label, e.g. '3-day follow up'."),
        definition: definitionSchema,
        transport: transportSchema.optional(),
        enabled: z
          .boolean()
          .optional()
          .describe(
            "Default true. False parks the sequence: it can be read and edited but neither its trigger nor a manual run advances it.",
          ),
      }),
    },
    async (input) => toolResult(await apiPost("/sequences", input)),
  );

  server.registerTool(
    "sequence_list",
    {
      title: "List Wonda sequences",
      description:
        "Every sequence on the account, with its full definition, its identity, whether it is enabled, and scheduleId: null means it has no trigger and only runs when something runs it. Use it to find a sequenceId before updating, running or scheduling one.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        persona: personaSchema.optional(),
      }),
    },
    async ({ persona }) => toolResult(await apiGet("/sequences", { persona })),
  );

  server.registerTool(
    "sequence_update",
    {
      title: "Update a Wonda sequence",
      description:
        "Change a sequence's name, steps, transport or enabled flag. Every field is optional; omitted fields are untouched.\n\n" +
        "A replaced definition is validated exactly as at create, so validate it first. Runs already in flight finish on the definition they started with.\n\n" +
        STEP_VOCABULARY,
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        sequenceId: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        definition: definitionSchema.optional(),
        transport: transportSchema.optional(),
        enabled: z.boolean().optional(),
      }),
    },
    async ({ sequenceId, ...body }) =>
      toolResult(
        await apiPatch(`/sequences/${encodeURIComponent(sequenceId)}`, body),
      ),
  );

  server.registerTool(
    "sequence_delete",
    {
      title: "Delete a Wonda sequence",
      description:
        "Remove a sequence, its runs and its trigger. A step already dispatched onto the identity is not recalled; the platform write may already have happened. Ask the user before calling this.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({ sequenceId: z.string().min(1) }),
    },
    async ({ sequenceId }) =>
      toolResult(
        await apiDelete(`/sequences/${encodeURIComponent(sequenceId)}`),
      ),
  );

  server.registerTool(
    "sequence_run",
    {
      title: "Run a Wonda sequence now",
      description:
        'Start ONE execution with the vars this run needs, which is how a single definition serves a different target each time: {"handle": "someone", "persona": "maddie"}.\n\n' +
        "Returns immediately with a queued run. It does NOT wait: a sequence with a 3-day wait takes 3 days. Report the runId to the user and check back with sequence_runs rather than polling in a loop.\n\n" +
        "Supply every var the definition needs (sequence_validate lists them as requiredVars); a missing one is rejected before a run is created.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        sequenceId: z.string().min(1),
        vars: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Values for the {{vars.*}} the definition reads."),
        startAt: z
          .string()
          .optional()
          .describe(
            "ISO-8601 instant to hold the first step until. A one-off delay, not a trigger: the run still happens exactly once.",
          ),
      }),
    },
    async ({ sequenceId, ...body }) =>
      toolResult(
        await apiPost(`/sequences/${encodeURIComponent(sequenceId)}/run`, body),
      ),
  );

  server.registerTool(
    "sequence_runs",
    {
      title: "Wonda sequence run status",
      description:
        "How a run is going. With runId, one run in full: its status, its position, and outputs (each id'd step's parsed result). Without runId, the recent runs, newest first.\n\n" +
        "A run inside a fan-out reports progress two ways: cursor.frames holds a frame with item and itemCount (which item of how many), and outputs holds the each's summary under its id: {total, completed, failedCount, failed}. Report it as '12 of 50 done, 1 failed', and read the bounded failed samples for what went wrong on which item. A failed item does not stop the rest by default, but the final run status is failed so partial failure is never hidden.\n\n" +
        "Reading the status: queued and running mean it is moving. waiting means it DEFERRED and nextRunAt says when it looks again, which is normal and not a problem: a wait step, an exhausted daily action budget, a platform cooldown, or the user's Mac being closed all read the same way. succeeded, failed and cancelled are final; a failed run carries lastError with the step that broke.\n\n" +
        "A deferral is not a failure and needs no intervention. Say when it will resume, not that something went wrong.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        runId: z.string().optional(),
        sequenceId: z.string().optional(),
        status: z
          .enum([
            "queued",
            "running",
            "waiting",
            "succeeded",
            "failed",
            "cancelled",
          ])
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ runId, sequenceId, status, limit }) =>
      toolResult(
        runId
          ? await apiGet(`/sequences/runs/${encodeURIComponent(runId)}`)
          : await apiGet("/sequences/runs", {
              sequenceId,
              status,
              limit: limit === undefined ? undefined : String(limit),
            }),
      ),
  );

  server.registerTool(
    "sequence_cancel_run",
    {
      title: "Cancel a Wonda sequence run",
      description:
        "Stop one queued, running or waiting run. The sequence itself is untouched and can be run again. A step already dispatched onto the identity is not recalled: that write may already have happened.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({ runId: z.string().min(1) }),
    },
    async ({ runId }) =>
      toolResult(
        await apiPost(`/sequences/runs/${encodeURIComponent(runId)}/cancel`),
      ),
  );

  server.registerTool(
    "sequence_schedule",
    {
      title: "Schedule a Wonda sequence",
      description:
        "Attach or remove a sequence's OPTIONAL trigger. This is an extra step, never automatic: a sequence with no trigger is the normal case and runs only when something runs it. Only call this when the user asked for it to happen on its own.\n\n" +
        "Attach with exactly one of:\n" +
        "  cron: recurring, 5-field, e.g. '0 9 * * 1-5'. Pass timezone (an IANA zone such as Europe/Paris) or it is read in UTC. ASK which zone rather than assuming.\n" +
        "  runAt: one-shot, an ISO-8601 instant. Fires once, ever.\n\n" +
        "jitterMinSeconds/jitterMaxSeconds spread the actual fire time inside a window after the slot. vars supplies every {{vars.*}} used by scheduled runs. By default a slot is skipped while an earlier run is still live; set allowOverlap only when the user explicitly wants concurrent runs.\n\n" +
        "detach: true removes the trigger and leaves the sequence intact.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        sequenceId: z.string().min(1),
        detach: z
          .boolean()
          .optional()
          .describe("Remove the trigger. Ignores every timing field."),
        cron: z.string().optional(),
        timezone: z.string().optional(),
        runAt: z.string().optional(),
        startsAt: z
          .string()
          .optional()
          .describe("ISO-8601. Before it, the trigger lies dormant."),
        endsAt: z
          .string()
          .optional()
          .describe("ISO-8601. After it, the trigger stops firing."),
        jitterMinSeconds: z.number().int().min(0).max(86_400).optional(),
        jitterMaxSeconds: z.number().int().min(0).max(86_400).optional(),
        vars: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Values supplied as {{vars.*}} to every scheduled run."),
        allowOverlap: z
          .boolean()
          .optional()
          .describe(
            "Default false. True deliberately permits concurrent runs of this sequence.",
          ),
        enabled: z.boolean().optional(),
      }),
    },
    async ({ sequenceId, detach, ...timing }) => {
      const path = `/sequences/${encodeURIComponent(sequenceId)}/schedule`;
      if (detach) return toolResult(await apiDelete(path));
      return toolResult(await apiPut(path, timing));
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
