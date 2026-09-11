// Generated from packages/features/src/twins/recruiter-action-contract.ts.
// Run: node apps/twin-runner/scripts/generate-recruiter-contract.mjs
// Source for the generated MCP and runner Recruiter contracts. No platform
// I/O occurs here; these are the existing synchronous hosted payload bounds.
// First CLI release containing the Recruiter command surface.
export const RECRUITER_MIN_CLI_VERSION = "1.61.0";
export const RECRUITER_ACTION_TIMEOUT_MS = 280_000;
export type RecruiterToolField = {
  name: string;
  required: boolean;
  kind: "string" | "boolean" | "stringArray" | "positiveInteger" | "value";
  flag?: string;
  enum?: string[];
  max?: number;
  minCount?: number;
  maxCount?: number;
  description?: string;
};
export type RecruiterToolDefinition = {
  verb: string;
  via: "cookies" | "wab";
  kind: "read" | "write";
  positionals: string[];
  fields: RecruiterToolField[];
};

const field = (
  name: string,
  kind: RecruiterToolField["kind"],
  flag?: string,
  required = false,
): RecruiterToolField => ({ name, kind, flag, required });
const filters: RecruiterToolField[] = [
  ...["filter", "excludeFilter", "rangeFilter", "toggle"].map((name) => ({
    ...field(
      name,
      "stringArray",
      `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
    ),
    maxCount: 26,
  })),
  {
    ...field("filtersJson", "string", "--filters-json"),
    description:
      "JSON filter object or clause array; file paths are not accepted by tools",
  },
  field("searchUrl", "string", "--search-url"),
];
const paging: RecruiterToolField[] = [
  { ...field("count", "positiveInteger", "--count"), max: 100 },
  { ...field("maxPages", "positiveInteger", "--max-pages"), max: 15 },
  field("start", "value", "--start"),
  field("delayMs", "value", "--delay"),
  field("all", "boolean", "--all"),
];
const detail: RecruiterToolField[] = [
  { ...field("details", "string", "--details"), enum: ["cards", "full"] },
  { ...field("maxProfiles", "positiveInteger", "--max-profiles"), max: 10 },
  field("noCache", "boolean", "--no-cache"),
];

export const RECRUITER_TOOL_DEFINITIONS: RecruiterToolDefinition[] = [
  {
    verb: "filters",
    via: "cookies",
    kind: "read",
    positionals: ["filterType", "query"],
    fields: [
      field("filterType", "string"),
      field("query", "string"),
      field("searchUrl", "string", "--search-url"),
      field("delayMs", "value", "--delay"),
    ],
  },
  {
    verb: "search",
    via: "cookies",
    kind: "read",
    positionals: ["keywords"],
    fields: [field("keywords", "string"), ...filters, ...paging, ...detail],
  },
  {
    verb: "save-search",
    via: "wab",
    kind: "write",
    positionals: ["name", "keywords"],
    fields: [
      field("name", "string", undefined, true),
      field("keywords", "string"),
      ...filters,
      field("recruiterProject", "string", "--recruiter-project"),
      field("newRecruiterProject", "string", "--new-recruiter-project"),
      field("alerts", "boolean", "--alerts"),
      field("delayMs", "value", "--delay"),
    ],
  },
  {
    verb: "saved-searches",
    via: "cookies",
    kind: "read",
    positionals: [],
    fields: [field("delayMs", "value", "--delay")],
  },
  {
    verb: "open-saved-search",
    via: "wab",
    kind: "read",
    positionals: ["reference"],
    fields: [
      field("reference", "string", undefined, true),
      ...filters,
      ...paging,
      ...detail,
    ],
  },
  {
    verb: "profile",
    via: "cookies",
    kind: "read",
    positionals: ["references"],
    fields: [
      {
        ...field("references", "stringArray", undefined, true),
        minCount: 1,
        maxCount: 10,
      },
      ...detail.filter((item) => item.name !== "details"),
      field("delayMs", "value", "--delay"),
    ],
  },
];

export function validateRecruiterToolPayload(
  definition: RecruiterToolDefinition,
  input: unknown,
): Record<string, unknown> {
  if (input === undefined) input = {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Recruiter payload must be an object");
  const value: Record<string, unknown> = { ...input };
  const fields = new Map(definition.fields.map((item) => [item.name, item]));
  for (const key of Object.keys(value)) {
    if (key === "via") {
      if (value.via !== "cookies" && value.via !== "wab")
        throw new Error("Recruiter via must be cookies or wab");
      continue;
    }
    if (!fields.has(key))
      throw new Error(`Unsupported Recruiter payload field ${key}`);
  }
  for (const spec of definition.fields) {
    const item = value[spec.name];
    if (item === undefined) {
      if (spec.required) throw new Error(`${spec.name} is required`);
      continue;
    }
    if (spec.kind === "string" && (typeof item !== "string" || !item.trim()))
      throw new Error(`${spec.name} must be a nonempty string`);
    if (spec.kind === "boolean" && typeof item !== "boolean")
      throw new Error(`${spec.name} must be boolean`);
    if (
      spec.kind === "positiveInteger" &&
      (typeof item !== "number" ||
        !Number.isSafeInteger(item) ||
        item < 1 ||
        item > (spec.max ?? Number.MAX_SAFE_INTEGER))
    )
      throw new Error(`${spec.name} exceeds its hosted bound`);
    if (
      spec.kind === "value" &&
      (typeof item !== "number" ||
        !Number.isSafeInteger(item) ||
        item < 0 ||
        item > 60000)
    )
      throw new Error(
        `${spec.name} must be a nonnegative integer no greater than 60000`,
      );
    if (
      spec.kind === "stringArray" &&
      (!Array.isArray(item) ||
        item.some((entry) => typeof entry !== "string" || !entry.trim()) ||
        item.length < (spec.minCount ?? 0) ||
        item.length > (spec.maxCount ?? 26))
    )
      throw new Error(`${spec.name} must be a bounded string array`);
    if (spec.enum && (typeof item !== "string" || !spec.enum.includes(item)))
      throw new Error(`Invalid ${spec.name}`);
  }
  if (typeof value.filtersJson === "string") {
    const parsed: unknown = JSON.parse(value.filtersJson);
    if (!parsed || typeof parsed !== "object")
      throw new Error("filtersJson must contain a JSON object or array");
  }
  if (
    definition.verb === "save-search" &&
    !!value.recruiterProject === !!value.newRecruiterProject
  )
    throw new Error("Choose exactly one existing or new Recruiter project");
  if (value.query && !value.filterType)
    throw new Error("query requires filterType");
  if (
    definition.verb === "open-saved-search" &&
    filters.some((item) => {
      const input = value[item.name];
      return Array.isArray(input) ? input.length > 0 : input !== undefined;
    })
  )
    throw new Error(
      "Native open restores its saved filters; refinements are not supported",
    );
  if (definition.verb === "search" || definition.verb === "open-saved-search") {
    value.count ??= 25;
    value.maxPages ??=
      value.all === true
        ? Math.min(15, Math.floor(375 / Number(value.count)))
        : 1;
    value.maxProfiles ??= 10;
    if (Number(value.count) * Number(value.maxPages) > 375)
      throw new Error(
        "Recruiter synchronous search is limited to 375 requested candidates",
      );
  }
  if (definition.verb === "profile") value.maxProfiles ??= 10;
  if (definition.verb === "search" || definition.verb === "save-search") {
    if (
      !value.keywords &&
      !value.searchUrl &&
      !value.filtersJson &&
      !filters.some((item) => {
        const entries = value[item.name];
        return Array.isArray(entries) && entries.length > 0;
      })
    )
      throw new Error(
        "Recruiter search requires keywords, filters, or a search URL",
      );
  }
  validateRecruiterPacing(definition, value);
  return value;
}

// Reject bounds whose deliberate waits already exhaust the synchronous budget.
// Budget for an uncached batch, preserve the caller's delay, and reserve 40s for
// actual work. This is a lower bound: filter resolution, profile expansion and
// network latency can still exhaust the deadline and must never trigger retries.
function validateRecruiterPacing(
  definition: RecruiterToolDefinition,
  value: Record<string, unknown>,
): void {
  const via = value.via ?? definition.via;
  const delay = Number(value.delayMs ?? 200);
  let waits = 0;
  if (definition.verb === "search" || definition.verb === "open-saved-search") {
    const pages = Number(value.maxPages);
    waits = via === "wab" ? 1 + 2 * (pages - 1) : pages - 1;
    if (definition.verb === "open-saved-search") waits += via === "wab" ? 1 : 2;
    if (value.details === "full") {
      const profiles = Math.min(
        Number(value.maxProfiles),
        Number(value.count) * pages,
      );
      waits += via === "wab" ? 2 * profiles - 1 : profiles;
    }
  } else if (definition.verb === "profile") {
    const references = Array.isArray(value.references) ? value.references : [];
    const profiles = Math.min(references.length, Number(value.maxProfiles));
    waits = via === "wab" ? 2 * profiles - 1 : profiles - 1;
  } else if (definition.verb === "save-search") {
    // List, prepare, form inputs, selection, submit and read-back (WAB);
    // list, project lookup, submit and read-back (cookies).
    waits =
      via === "wab"
        ? value.newRecruiterProject
          ? 9
          : 8
        : value.newRecruiterProject
          ? 5
          : 3;
  }
  if (waits * delay > RECRUITER_ACTION_TIMEOUT_MS - 40_000)
    throw new Error(
      "Recruiter pacing exceeds the synchronous time budget; request fewer pages/profiles or use the local CLI for a longer operation. The requested delay is never reduced.",
    );
}

export function buildRecruiterToolArgv(
  definition: RecruiterToolDefinition,
  input: unknown,
  persona: string,
  account?: string,
): string[] {
  const value = validateRecruiterToolPayload(definition, input);
  const via = typeof value.via === "string" ? value.via : definition.via;
  const argv = [
    "--json",
    "linkedin",
    "recruiter",
    definition.verb,
    "--account",
    account ?? persona,
    "--persona",
    persona,
    "--via",
    via,
    "--engine",
    "local",
  ];
  if (via === "cookies") argv.push("--wab", "off");
  if (definition.kind === "write") argv.push("--no-auto-persona");
  for (const field of definition.fields) {
    if (!field.flag || value[field.name] === undefined) continue;
    const entry = value[field.name];
    for (const item of Array.isArray(entry) ? entry : [entry])
      argv.push(`${field.flag}=${String(item)}`);
  }
  const positionals = definition.positionals.flatMap((name): string[] => {
    const entry = value[name];
    if (typeof entry === "string") return [entry];
    if (Array.isArray(entry))
      return entry.filter((item): item is string => typeof item === "string");
    return [];
  });
  if (positionals.length) argv.push("--", ...positionals);
  return argv;
}
