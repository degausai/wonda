export type LocalActionKind = "read" | "write";
export type LocalActionPlatform = "linkedin" | "reddit" | "x" | "instagram";

export type LocalActionSpec = {
  platform: LocalActionPlatform;
  action: string;
  kind: LocalActionKind;
  requestedSlots: Record<string, number>;
  variableSlots: boolean;
  toolName: string;
  via: "cookies" | "wab";
  // When set, buildArgv honors a payload.via of "cookies"|"wab" over the
  // spec's default transport. Additive: specs that don't opt in are
  // byte-identical to today's hardcoded-via behavior.
  viaOverride?: boolean;
  payloadFields: PayloadFieldSpec[];
  supportsPagination: boolean;
  // Overrides the default 180s exec timeout for long-paced actions.
  timeoutMs?: number;
  // Minimum installed CLI version that implements this verb. Local MCP updates
  // independently of the wonda binary, so runLocalVerb refuses with upgrade
  // guidance instead of exec'ing an unknown command. Mirrors the server
  // registry's minVersionForAction; unknown/dev versions never block.
  minCliVersion?: string;
  // The minCliVersion floor applies only when this predicate returns true for
  // the call's payload (absent = always).
  minCliVersionWhen?: (payload: Record<string, unknown>) => boolean;
  // On a non-zero exit, attach stdout as the error result's `partialResult`
  // when it still parses as JSON, instead of discarding it. Opt-in: only
  // linkedin/enrich's CLI contract keeps already-resolved batch items in
  // stdout when it stops on a mid-batch rate limit.
  preservePartialStdout?: boolean;
  buildArgv: (payload: unknown, persona: string, account?: string) => string[];
};

// Declarative payload-field metadata mirroring what buildArgv reads, so tool
// input schemas can list real field names instead of a free-form record.
// "value" fields accept string | number | boolean (buildArgv stringifies).
export type PayloadFieldSpec = {
  name: string;
  required: boolean;
  kind: "string" | "value" | "boolean" | "stringArray";
  enum?: string[];
  maxCount?: number;
  /** Agent-facing hint (rendered as the field's schema `.describe()`) so a
   * remote tool caller knows what to send instead of getting a bare
   * validation error. */
  description?: string;
};

type Payload = Record<string, unknown>;
type FlagSpec =
  | [flag: string, field: string]
  | [flagFromPayload: (payload: Payload) => string | undefined];
type MediaSpec = { flag: "--media" | "--attach"; maxCount: number };

const DEFAULT_DURATION_MS = 120_000;
const MAX_DURATION_MS = 180_000;
const ENGAGE_COMMENTERS_DEFAULT_DURATION_MS = 180_000;

// Actions whose buildArgv reads fields the generic derivation cannot see
// (function positionals/flags). Overrides replace the derived list wholesale.
const FIELD_OVERRIDES: Record<string, PayloadFieldSpec[]> = {
  "linkedin/connection-status": [
    { name: "targets", required: true, kind: "stringArray" },
  ],
  "linkedin/activity": [
    {
      name: "target",
      required: true,
      kind: "string",
      description:
        'The LinkedIn member whose recent activity to fetch: a profile URL, vanity handle (e.g. "williamhgates"), or member URN.',
    },
    {
      name: "type",
      required: false,
      kind: "string",
      enum: ["all", "comments", "reactions"],
      description:
        'Which activity to return: "all" (default), "comments", or "reactions".',
    },
    { name: "count", required: false, kind: "value" },
  ],
  "linkedin/enrich": [
    {
      name: "target",
      required: false,
      kind: "string",
      description:
        "A single profile URL or vanity name to enrich. Exactly one of target or targets is required.",
    },
    {
      name: "targets",
      required: false,
      kind: "stringArray",
      maxCount: 10,
      description:
        "Enrich up to 10 profiles in one call: an array of profile URLs or vanity names. Exactly one of target or targets is required.",
    },
    {
      name: "via",
      required: false,
      kind: "string",
      enum: ["cookies", "wab"],
      description:
        "Where to run the batch: cookies (flat store, default) or wab (the persona's Wonda Automation Browser session; every profile read happens inside the logged-in browser).",
    },
  ],
  "linkedin/enrich-engagers": [
    { name: "activityId", required: true, kind: "string" },
    { name: "reactions", required: false, kind: "value" },
    { name: "comments", required: false, kind: "value" },
    { name: "maxProfiles", required: false, kind: "value" },
    { name: "companyDetail", required: false, kind: "value" },
    {
      name: "profileSource",
      required: false,
      kind: "string",
      enum: ["cookies", "public"],
    },
  ],
  "linkedin/salesnav-connect": [
    { name: "urn", required: true, kind: "string" },
    { name: "expectName", required: true, kind: "string" },
    { name: "note", required: false, kind: "string" },
    { name: "send", required: false, kind: "boolean" },
  ],
  "linkedin/salesnav-message": [
    { name: "urn", required: true, kind: "string" },
    { name: "text", required: true, kind: "string" },
    { name: "expectName", required: true, kind: "string" },
    { name: "subject", required: false, kind: "string" },
    { name: "send", required: false, kind: "boolean" },
  ],
  "reddit/vote": [
    { name: "fullname", required: true, kind: "string" },
    {
      name: "vote",
      required: false,
      kind: "string",
      enum: ["up", "down", "unvote"],
    },
    { name: "postId", required: false, kind: "value" },
  ],
  "x/dm-start": [
    { name: "handle", required: true, kind: "string" },
    { name: "text", required: true, kind: "string" },
    { name: "dryRun", required: false, kind: "value" },
  ],
};

const ACTION_DEFINITIONS = [
  read("linkedin", "me", []),
  read("linkedin", "search", ["query"]),
  read("linkedin", "profile", ["target"]),
  write(
    "linkedin",
    "visit",
    "visit",
    ["target"],
    [
      ["--dwell-ms", "dwellMs"],
      ["--no-scroll", "noScroll"],
    ],
  ),
  read("linkedin", "posts", ["target"]),
  read("linkedin", "post-details", ["target"]),
  read("linkedin", "analytics", ["target"]),
  read("linkedin", "comments", ["target"]),
  read(
    "linkedin",
    "search-posts",
    ["query"],
    [
      ["--max-posts", "maxPosts"],
      ["--min-reactions", "minReactions"],
      ["--exclude-company-pages", "excludeCompanyPages"],
      ["--date-range", "dateRange"],
      ["--with-author-profile", "withAuthorProfile"],
    ],
    "wab",
  ),
  read("linkedin", "saves", []),
  read("linkedin", "reactions", ["target"]),
  read("linkedin", "company", ["target"]),
  read("linkedin", "conversations", []),
  read("linkedin", "messages", ["target"]),
  read("linkedin", "notifications", []),
  read("linkedin", "connections", []),
  read("linkedin", "sent-invitations", []),
  read("linkedin", "invitations", []),
  read("linkedin", "connection-status", (payload) =>
    stringArrayField(payload, "targets"),
  ),
  write(
    "linkedin",
    "connect",
    "connect",
    ["target"],
    [["--message", "message"]],
  ),
  write("linkedin", "mute", "mute", ["target"]),
  write(
    "linkedin",
    "like",
    "like",
    ["target"],
    [
      ["--reaction", "reaction"],
      ["--comment", "comment"],
    ],
  ),
  write("linkedin", "unlike", "like", ["target"], [["--comment", "comment"]]),
  write(
    "linkedin",
    "send-message",
    "message",
    ["target", "message"],
    [
      ["--participant-name", "participantName"],
      ["--dry-run", "dryRun"],
    ],
  ),
  write(
    "linkedin",
    "inmail",
    "inmail",
    ["target"],
    [
      ["--subject", "subject"],
      ["--message", "message"],
      // Deliberately the deprecated spelling of --spend-credit: local MCP runs
      // a separately installed wonda binary, and pre-rename binaries reject
      // --spend-credit. The CLI keeps the alias, so this works on any version.
      ["--yes-consume-credit", "yesConsumeCredit"],
      ["--dry-run", "dryRun"],
    ],
  ),
  // Read side of the credit pool linkedin/inmail spends; no pagination.
  // 1.53.0 is the first CLI release with the verb.
  withMinCliVersion(
    read("linkedin", "inmail-credits", [], [], "cookies", false),
    "1.53.0",
  ),
  write(
    "linkedin",
    "post",
    "post",
    ["text"],
    [["--visibility", "visibility"]],
    { flag: "--media", maxCount: 4 },
  ),
  write("linkedin", "delete-post", "post", ["target"]),
  write("linkedin", "edit-post", "post", ["target", "text"]),
  write("linkedin", "comment", "comment", ["target", "text"]),
  write("linkedin", "reply-comment", "comment", ["target", "text"]),
  write("linkedin", "edit-comment", "comment", ["target", "text"]),
  feedEngage("linkedin", "like"),
  engageCommenters(),
  // 1.53.0 is the first CLI release that accepts --via wab for enrich.
  // A full 10-target batch runs 9 inter-profile sleeps (4-12s jitter, up to
  // 108s worst case) plus up to 3 voyager reads per profile (profile,
  // education, per-experience company lookups), comfortably under the
  // default 180s exec timeout already; the 600s ceiling below is kept as
  // headroom (see enrichPositionals's cap comment), the same generous
  // ceiling as enrich-engagers below.
  withTimeout(
    withPreservePartialStdout(
      withMinCliVersion(
        read("linkedin", "enrich", enrichPositionals, [], "cookies", true, {
          viaOverride: true,
        }),
        "1.53.0",
        (payload) => payload.via === "wab",
      ),
    ),
    600_000,
  ),
  write("linkedin", "follow", "follow", ["target"]),
  read(
    "linkedin",
    "activity",
    ["target"],
    [
      ["--type", "type"],
      ["--count", "count"],
    ],
    "cookies",
    false,
  ),
  read("linkedin", "comment-reactors", ["commentUrn"]),
  write("linkedin", "delete-comment", "comment", ["target"]),
  // 25 profiles at 4-12s pacing runs past the default 180s exec timeout;
  // mirror the server budget. maxProfiles is capped like the server schema.
  withTimeout(
    read(
      "linkedin",
      "enrich-engagers",
      [],
      [
        ["--activity-id", "activityId"],
        [
          (payload) =>
            payload.reactions === false ? "--reactions=false" : undefined,
        ],
        ["--comments", "comments"],
        [
          (payload) => {
            const value = payload.maxProfiles;
            if (value === undefined) return "--max-profiles=10";
            if (
              typeof value !== "number" ||
              !Number.isFinite(value) ||
              value < 1 ||
              value > 25
            ) {
              throw new Error("maxProfiles must be a number between 1 and 25");
            }
            return `--max-profiles=${value}`;
          },
        ],
        [
          (payload) =>
            payload.companyDetail === false
              ? "--company-detail=false"
              : undefined,
        ],
        ["--profile-source", "profileSource"],
      ],
      "cookies",
      false,
    ),
    310_000,
  ),
  salesnav("search", {
    optionalPositionals: ["keywords"],
    facetFlags: [
      ["--seniority", "seniority"],
      ["--region", "region"],
      ["--industry", "industry"],
      ["--company", "company"],
      ["--function", "function"],
      ["--connection-of", "connectionOf"],
      ["--title", "title"],
      ["--past-title", "pastTitle"],
      ["--past-company", "pastCompany"],
      ["--school", "school"],
      ["--years-of-experience", "yearsOfExperience"],
    ],
    pagination: true,
  }),
  salesnav("facets", { optionalPositionals: ["type", "query"] }),
  salesnav("typeahead", { positionals: ["query"] }),
  salesnav("profile", {
    // --enrich makes ~2 extra by-URN reads per lead, so the CLI caps enriched
    // calls at 25 (salesnavEnrichCap). Reject >25 up front instead of failing at
    // runtime; unenriched calls keep the 50-lead batch ceiling.
    variadicField: {
      name: "urns",
      maxCount: 50,
      enrichCap: { field: "enrich", maxCount: 25 },
    },
    flags: [["--enrich", "enrich"]],
  }),
  salesnav("insights", { positionals: ["urn"] }),
  salesnav("warm-intro", {
    positionals: ["urn"],
    flags: [["--count", "count"]],
  }),
  salesnav("notifications", { flags: [["--count", "count"]] }),
  salesnav("spotlights", {
    flags: [
      ["--list", "list"],
      ["--limit", "limit"],
      ["--changed-within-days", "changedWithinDays"],
      ["--posted-within-days", "postedWithinDays"],
    ],
  }),
  salesnav("recommended", { subVerb: "leads", pagination: true }),
  salesnav("recommended", { subVerb: "companies", pagination: true }),
  salesnav("alerts"),
  salesnav("lists"),
  salesnav("personas"),
  salesnav("recent"),
  salesnav("saved-searches"),
  // Sales Navigator DOM WRITES (wab-only; no cookies write path).
  salesnav("save-lead", {
    positionals: ["urn"],
    flags: [["--unsave", "unsave"]],
    write: { slot: "save-lead" },
    minCliVersion: "1.53.0",
  }),
  salesnav("save-search", {
    positionals: ["name"],
    optionalPositionals: ["keywords"],
    facetFlags: [
      ["--seniority", "seniority"],
      ["--region", "region"],
      ["--industry", "industry"],
      ["--company", "company"],
      ["--function", "function"],
      ["--connection-of", "connectionOf"],
      ["--title", "title"],
      ["--past-title", "pastTitle"],
      ["--past-company", "pastCompany"],
      ["--school", "school"],
      ["--years-of-experience", "yearsOfExperience"],
    ],
    write: { slot: "save-search" },
    minCliVersion: "1.53.0",
  }),
  salesnav("delete-saved-search", {
    positionals: ["id"],
    write: { slot: "delete-saved-search" },
    minCliVersion: "1.53.0",
  }),
  salesnav("create-list", {
    positionals: ["name"],
    flags: [["--description", "description"]],
    write: { slot: "create-list" },
    minCliVersion: "1.53.0",
  }),
  salesnav("delete-list", {
    positionals: ["id"],
    write: { slot: "delete-list" },
    minCliVersion: "1.53.0",
  }),
  salesnav("list-add", {
    positionals: ["listId", "urn"],
    write: { slot: "list-add" },
    minCliVersion: "1.53.0",
  }),
  salesnav("list-remove", {
    positionals: ["listId", "urn"],
    write: { slot: "list-remove" },
    minCliVersion: "1.53.0",
  }),
  salesnav("message", {
    positionals: ["urn"],
    flags: [
      ["--text", "text"],
      ["--expect-name", "expectName"],
      ["--subject", "subject"],
      // Preview-first: omitted/false composes and returns the exact text
      // WITHOUT sending; send=true is required to actually send.
      ["--send", "send"],
    ],
    write: { slot: "message" },
    minCliVersion: "1.53.0",
  }),
  salesnav("connect", {
    positionals: ["urn"],
    flags: [
      ["--expect-name", "expectName"],
      // Optional invitation note attached to the connection request.
      ["--note", "note"],
      // Preview-first: omitted/false opens the Connect flow and returns the
      // note WITHOUT sending; send=true is required to actually send.
      ["--send", "send"],
    ],
    write: { slot: "connect", variable: true },
    minCliVersion: "1.53.0",
  }),

  read("reddit", "search", ["query"]),
  read("reddit", "subreddit", ["target"]),
  read("reddit", "rules", ["target"]),
  read("reddit", "feed", ["subreddit"]),
  read("reddit", "comments", ["subreddit"]),
  read("reddit", "user", ["target"]),
  read("reddit", "whoami", []),
  read("reddit", "user-posts", ["target"]),
  read("reddit", "user-comments", ["target"]),
  read("reddit", "post", ["target"]),
  read("reddit", "analytics", ["target"]),
  read("reddit", "trending", []),
  read("reddit", "home", []),
  read("reddit", "saved", []),
  read("reddit", "inbox", []),
  write(
    "reddit",
    "comment",
    "comment",
    ["parentFullname"],
    [
      ["--text", "text"],
      ["--post-id", "postId"],
      ["--dry-run", "dryRun"],
    ],
  ),
  write(
    "reddit",
    "vote",
    "vote",
    ["fullname"],
    [
      [
        (payload) => {
          const vote = optionalStringField(payload, "vote");
          if (vote === undefined) return undefined;
          if (!["up", "down", "unvote"].includes(vote)) {
            throw new Error("vote must be up, down, or unvote");
          }
          return `--${vote}`;
        },
      ],
      ["--post-id", "postId"],
    ],
  ),
  write(
    "reddit",
    "submit",
    "submit",
    ["subreddit"],
    [
      ["--title", "title"],
      ["--text", "text"],
      ["--url", "url"],
      ["--flair", "flair"],
      ["--dry-run", "dryRun"],
    ],
    { flag: "--media", maxCount: 1 },
  ),
  write("reddit", "subscribe", "subscribe", ["target"]),
  write("reddit", "save", "save", ["fullname"], [["--post-id", "postId"]]),
  write("reddit", "unsave", "save", ["fullname"], [["--post-id", "postId"]]),
  write("reddit", "delete", "delete", ["fullname"], [["--post-id", "postId"]]),
  feedEngage("reddit", "vote"),
  redditChatRead("inbox", [], [["--count", "count"]]),
  redditChatRead("messages", ["conversationId"], [["--count", "count"]]),
  redditChatWrite(
    "send",
    "message",
    ["conversationId"],
    [
      ["--text", "text"],
      ["--dry-run", "dryRun"],
    ],
  ),
  redditChatWrite(
    "start",
    "message",
    ["username"],
    [
      ["--text", "text"],
      ["--dry-run", "dryRun"],
    ],
  ),
  redditChatWrite("accept", "message", ["conversationId"]),
  redditChatWrite("accept-all", "message", [], [["--delay", "delayMs"]]),

  read("x", "search", ["query"]),
  read("x", "user-tweets", ["target"]),
  read("x", "read", ["tweetId"]),
  read("x", "analytics", ["tweetId"]),
  read("x", "user", ["target"]),
  read("x", "replies", ["tweetId"]),
  read("x", "thread", ["tweetId"]),
  read("x", "home", []),
  read("x", "bookmarks", []),
  read("x", "likes", []),
  read("x", "following", ["target"]),
  read("x", "followers", ["target"]),
  read("x", "lists", []),
  read("x", "list-timeline", ["target"]),
  read("x", "news", []),
  read("x", "mentions", []),
  write("x", "tweet", "tweet", ["text"], [], {
    flag: "--attach",
    maxCount: 4,
  }),
  write("x", "reply", "reply", ["tweetId", "text"], [], {
    flag: "--attach",
    maxCount: 4,
  }),
  write("x", "quote", "quote", ["tweetId", "text"], [], {
    flag: "--attach",
    maxCount: 4,
  }),
  write("x", "like", "like", ["tweetId"]),
  write("x", "unlike", "like", ["tweetId"]),
  write("x", "bookmark", "bookmark", ["tweetId"]),
  write("x", "unbookmark", "bookmark", ["tweetId"]),
  write("x", "retweet", "retweet", ["tweetId"]),
  write("x", "unretweet", "retweet", ["tweetId"]),
  write("x", "follow", "follow", ["handle"]),
  write("x", "unfollow", "follow", ["handle"]),
  write("x", "delete", "delete", ["tweetId"]),
  feedEngage("x", "like"),
  xDm("inbox", "read", []),
  xDm("read", "read", ["conversationId"]),
  xDm("requests", "read", []),
  xDm("send", "write", ["conversationId", "text"], [["--dry-run", "dryRun"]]),
  xDm("accept", "write", ["conversationId"], [["--dry-run", "dryRun"]]),
  xDm(
    "start",
    "write",
    ["handle"],
    [
      ["--text", "text"],
      ["--dry-run", "dryRun"],
    ],
  ),

  read("instagram", "saved", []),
  read("instagram", "comments", ["target"]),
  write("instagram", "comment", "comment", ["media", "text"]),
  feedEngage("instagram", "like"),
];

export const LOCAL_ACTIONS: Record<string, LocalActionSpec> =
  Object.fromEntries(
    ACTION_DEFINITIONS.map((definition) => [
      `${definition.platform}/${definition.action}`,
      definition,
    ]),
  );

function read(
  platform: LocalActionPlatform,
  action: string,
  positionals: string[] | ((payload: Payload) => string[]),
  flags: FlagSpec[] = [],
  via: "cookies" | "wab" = "cookies",
  pagination = true,
  options: { viaOverride?: boolean } = {},
): LocalActionSpec {
  return actionSpec({
    platform,
    action,
    kind: "read",
    requestedSlots: {},
    variableSlots: false,
    positionals,
    flags,
    via,
    pagination,
    viaOverride: options.viaOverride,
  });
}

function write(
  platform: LocalActionPlatform,
  action: string,
  slot: string,
  positionals: string[] | ((payload: Payload) => string[]),
  flags: FlagSpec[] = [],
  media?: MediaSpec,
): LocalActionSpec {
  return actionSpec({
    platform,
    action,
    kind: "write",
    requestedSlots: { [slot]: 1 },
    variableSlots: false,
    positionals,
    flags,
    media,
  });
}

function redditChatRead(
  action: string,
  positionals: string[],
  flags: FlagSpec[] = [],
): LocalActionSpec {
  return chatActionSpec({
    verb: action,
    kind: "read",
    requestedSlots: {},
    variableSlots: false,
    positionals,
    flags,
  });
}

function redditChatWrite(
  action: string,
  slot: string,
  positionals: string[],
  flags: FlagSpec[] = [],
): LocalActionSpec {
  return chatActionSpec({
    verb: action,
    kind: "write",
    requestedSlots: { [slot]: 1 },
    variableSlots: false,
    positionals,
    flags,
  });
}

function actionSpec(args: {
  platform: LocalActionPlatform;
  action: string;
  kind: LocalActionKind;
  requestedSlots: Record<string, number>;
  variableSlots: boolean;
  positionals: string[] | ((payload: Payload) => string[]);
  flags: FlagSpec[];
  media?: MediaSpec;
  via?: "cookies" | "wab";
  viaOverride?: boolean;
  pagination?: boolean;
}): LocalActionSpec {
  const pagination = args.pagination ?? true;
  return {
    platform: args.platform,
    action: args.action,
    kind: args.kind,
    requestedSlots: args.requestedSlots,
    variableSlots: args.variableSlots,
    toolName: `${args.platform}_${args.action.replaceAll("-", "_")}`,
    via: args.via ?? viaForKind(args.kind),
    viaOverride: args.viaOverride,
    payloadFields:
      FIELD_OVERRIDES[`${args.platform}/${args.action}`] ??
      derivePayloadFields(args.positionals, args.flags, args.media),
    supportsPagination: pagination,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const viaValue =
        args.viaOverride && (parsed.via === "cookies" || parsed.via === "wab")
          ? parsed.via
          : (args.via ?? viaForKind(args.kind));
      const argv = [
        "--json",
        args.platform,
        args.action,
        ...positionalsFor(args.positionals, parsed),
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        viaValue,
      ];
      if (args.kind === "write") argv.push("--no-auto-persona");
      pushFlags(argv, args.flags, parsed);
      pushMedia(argv, args.media, parsed);
      if (pagination) pushCommonPagination(argv, parsed);
      return argv;
    },
  };
}

function chatActionSpec(args: {
  verb: string;
  kind: LocalActionKind;
  requestedSlots: Record<string, number>;
  variableSlots: boolean;
  positionals: string[];
  flags: FlagSpec[];
}): LocalActionSpec {
  return {
    platform: "reddit",
    action: `chat-${args.verb}`,
    kind: args.kind,
    requestedSlots: args.requestedSlots,
    variableSlots: args.variableSlots,
    toolName: `reddit_chat_${args.verb.replaceAll("-", "_")}`,
    via: viaForKind(args.kind),
    payloadFields: derivePayloadFields(args.positionals, args.flags, undefined),
    supportsPagination: false,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const argv = [
        "--json",
        "reddit",
        "chat",
        args.verb,
        ...fields(parsed, args.positionals),
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        viaForKind(args.kind),
      ];
      if (args.kind === "write") argv.push("--no-auto-persona");
      pushFlags(argv, args.flags, parsed);
      return argv;
    },
  };
}

// Sales Navigator commands nest under `linkedin salesnav <verb> [subVerb]`.
// Reads run over the cookies transport; the DOM WRITE verbs (opts.write) are
// wab-only and run on the persona/twin WAB (--via wab, --no-auto-persona).
function salesnav(
  verb: string,
  opts: {
    subVerb?: string;
    positionals?: string[];
    optionalPositionals?: string[];
    // enrichCap lowers maxCount when the named boolean flag is set, matching a
    // CLI cap that only applies to the enriched (extra-fetch) path.
    variadicField?: {
      name: string;
      maxCount: number;
      enrichCap?: { field: string; maxCount: number };
    };
    facetFlags?: [flag: string, field: string][];
    flags?: FlagSpec[];
    pagination?: boolean;
    // A DOM WRITE verb: flips the transport to wab and consumes the named
    // slot. `variable` marks preview-first writes (mirrors the hosted
    // registry's variableSlots): the slot is the maximum a SEND charges, and
    // the default preview consumes nothing.
    write?: { slot: string; variable?: true };
    minCliVersion?: string;
  } = {},
): LocalActionSpec {
  const action =
    opts.subVerb === undefined
      ? `salesnav-${verb}`
      : `salesnav-${verb}-${opts.subVerb}`;
  const payloadFields: PayloadFieldSpec[] = [
    ...(opts.positionals ?? []).map(
      (name): PayloadFieldSpec => ({ name, required: true, kind: "string" }),
    ),
    ...(opts.optionalPositionals ?? []).map(
      (name): PayloadFieldSpec => ({ name, required: false, kind: "string" }),
    ),
    ...(opts.variadicField === undefined
      ? []
      : [
          {
            name: opts.variadicField.name,
            required: true,
            kind: "stringArray",
            maxCount: opts.variadicField.maxCount,
          } satisfies PayloadFieldSpec,
        ]),
    ...(opts.facetFlags ?? []).map(
      ([, field]): PayloadFieldSpec => ({
        name: field,
        required: false,
        kind: "stringArray",
      }),
    ),
    ...(opts.flags ?? []).flatMap(([flagOrFactory, field]) =>
      typeof flagOrFactory === "function" || field === undefined
        ? []
        : [
            {
              name: field,
              required: false,
              kind: "value",
            } satisfies PayloadFieldSpec,
          ],
    ),
  ];
  const spec: LocalActionSpec = {
    platform: "linkedin",
    action,
    kind: opts.write ? "write" : "read",
    requestedSlots: opts.write ? { [opts.write.slot]: 1 } : {},
    variableSlots: opts.write?.variable === true,
    toolName: `linkedin_${action.replaceAll("-", "_")}`,
    via: opts.write ? "wab" : "cookies",
    // FIELD_OVERRIDES wins (same as actionSpec): the derived fields type every
    // flag as an optional generic value, but writes like salesnav-message/
    // salesnav-connect have required non-empty strings (text, expectName) in
    // both the CLI and the hosted schema, and the MCP schema must say so.
    payloadFields: FIELD_OVERRIDES[`linkedin/${action}`] ?? payloadFields,
    supportsPagination: opts.pagination ?? false,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const argv = ["--json", "linkedin", "salesnav", verb];
      if (opts.subVerb !== undefined) argv.push(opts.subVerb);
      argv.push(...fields(parsed, opts.positionals ?? []));
      for (const name of opts.optionalPositionals ?? []) {
        const value = optionalStringField(parsed, name);
        if (value === undefined) break;
        argv.push(value);
      }
      if (opts.variadicField !== undefined) {
        const values = stringArrayField(parsed, opts.variadicField.name);
        if (values.length === 0) {
          throw new Error(`${opts.variadicField.name} is required`);
        }
        const { maxCount, enrichCap } = opts.variadicField;
        const enrichActive =
          enrichCap !== undefined && checkIsFlagActive(parsed[enrichCap.field]);
        const cap = enrichActive ? enrichCap.maxCount : maxCount;
        if (values.length > cap) {
          throw new Error(
            `${opts.variadicField.name} must have at most ${cap} items${
              enrichActive ? ` when ${enrichCap.field} is set` : ""
            }`,
          );
        }
        argv.push(...values);
      }
      argv.push(
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        opts.write ? "wab" : "cookies",
      );
      if (opts.write) argv.push("--no-auto-persona");
      for (const [flag, field] of opts.facetFlags ?? []) {
        pushRepeatedFlag(argv, flag, parsed[field]);
      }
      pushFlags(argv, opts.flags ?? [], parsed);
      if (opts.pagination === true) pushCommonPagination(argv, parsed);
      return argv;
    },
  };
  return opts.minCliVersion === undefined
    ? spec
    : withMinCliVersion(spec, opts.minCliVersion);
}

// X DMs nest under `x dm <verb>`. Reads default to cookies; writes are
// wab-only and additionally require a pre-saved encrypted XChat passcode
// (`wonda x dm passcode set`, terminal-only).
function xDm(
  verb: string,
  kind: LocalActionKind,
  positionals: string[],
  flags: FlagSpec[] = [],
): LocalActionSpec {
  const action = `dm-${verb}`;
  return {
    platform: "x",
    action,
    kind,
    requestedSlots: kind === "write" ? { message: 1 } : {},
    variableSlots: false,
    toolName: `x_dm_${verb.replaceAll("-", "_")}`,
    via: viaForKind(kind),
    payloadFields:
      FIELD_OVERRIDES[`x/${action}`] ??
      derivePayloadFields(positionals, flags, undefined),
    supportsPagination: kind === "read",
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const argv = [
        "--json",
        "x",
        "dm",
        verb,
        ...fields(parsed, positionals),
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        viaForKind(kind),
      ];
      if (kind === "write") argv.push("--no-auto-persona");
      pushFlags(argv, flags, parsed);
      if (kind === "read") pushCommonPagination(argv, parsed);
      return argv;
    },
  };
}

function feedEngage(
  platform: LocalActionPlatform,
  slot: string,
): LocalActionSpec {
  return {
    platform,
    action: "feed-engage",
    kind: "write",
    requestedSlots: { [slot]: 1 },
    variableSlots: false,
    toolName: `${platform}_feed_engage`,
    via: "wab",
    payloadFields: feedEngagePayloadFields(platform),
    supportsPagination: false,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const argv = ["--json", platform, "feed-engage"];
      pushCsvFlag(argv, "--authors", parsed.authors);
      pushCsvFlag(argv, "--keywords", parsed.keywords);
      pushCsvFlag(argv, "--subreddits", parsed.subreddits);
      pushFlag(argv, "--reply", parsed.reply);
      pushFlag(argv, "--reply-style", parsed.replyStyle);
      pushFlag(argv, "--persona-reply", parsed.personaReply);
      pushFlag(argv, "--relevance-threshold", parsed.relevanceThreshold);
      pushFlag(argv, "--relevance-prompt", parsed.relevancePrompt);
      pushFlag(argv, "--max-reply", parsed.maxReply);
      pushFlag(argv, "--per-day-cap", parsed.perDayCap);
      pushFlag(argv, "--max-scan", parsed.maxScan);
      pushFlag(argv, "--dry-run", parsed.dryRun);
      argv.push(
        "--duration",
        `${numberField(parsed, "durationMs", DEFAULT_DURATION_MS)}ms`,
        "--max-engage",
        String(numberField(parsed, "maxEngage", 1)),
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        "wab",
        "--no-auto-persona",
      );
      pushFlag(argv, "--engage-comments", parsed.engageComments);
      const engageCommentsFrom = optionalStringField(
        parsed,
        "engageCommentsFrom",
      );
      if (
        engageCommentsFrom !== undefined &&
        engageCommentsFrom !== "authors"
      ) {
        argv.push("--engage-comments-from", engageCommentsFrom);
      }
      pushFlag(argv, "--max-comment-engage", parsed.maxCommentEngage);
      const navigate = optionalStringField(parsed, "navigate") ?? "never";
      if (navigate === "never") {
        argv.push("--no-navigate");
      }
      const scrollMode = optionalStringField(parsed, "scrollMode") ?? "manual";
      if (scrollMode === "manual") {
        argv.push("--manual-scroll");
      }
      if (parsed.scanIntervalMs !== undefined) {
        argv.push("--scan-interval", `${stringValue(parsed.scanIntervalMs)}ms`);
      }
      pushCsvFlag(argv, "--reactions", parsed.reactions);
      if (parsed.expandPosts === false) argv.push("--expand-posts=false");
      return argv;
    },
  };
}

function engageCommenters(): LocalActionSpec {
  return {
    platform: "linkedin",
    action: "engage-commenters",
    kind: "write",
    requestedSlots: { like: 25, comment: 25, connect: 25 },
    variableSlots: true,
    toolName: "linkedin_engage_commenters",
    via: "wab",
    payloadFields: [
      { name: "post", required: true, kind: "string" },
      { name: "actions", required: false, kind: "stringArray" },
      { name: "maxCommenters", required: false, kind: "value" },
      { name: "durationMs", required: false, kind: "value" },
      { name: "replyText", required: false, kind: "string" },
      { name: "connectNote", required: false, kind: "string" },
      { name: "dryRun", required: false, kind: "value" },
    ],
    supportsPagination: false,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
      const actions = stringArrayField(parsed, "actions", ["like"]);
      const durationMs = numberField(
        parsed,
        "durationMs",
        ENGAGE_COMMENTERS_DEFAULT_DURATION_MS,
      );
      if (durationMs > MAX_DURATION_MS) {
        throw new Error("durationMs exceeds limit");
      }
      const argv = [
        "--json",
        "linkedin",
        "engage-commenters",
        "--post",
        requiredStringField(parsed, "post"),
        "--actions",
        actions.join(","),
        "--max-commenters",
        String(numberField(parsed, "maxCommenters", 25)),
        "--duration",
        `${durationMs}ms`,
        "--account",
        account ?? persona,
        "--persona",
        persona,
        "--via",
        "wab",
        "--no-auto-persona",
      ];
      pushFlag(argv, "--reply-text", parsed.replyText);
      pushFlag(argv, "--connect-note", parsed.connectNote);
      pushFlag(argv, "--dry-run", parsed.dryRun);
      return argv;
    },
  };
}

function viaForKind(kind: LocalActionKind): "cookies" | "wab" {
  return kind === "read" ? "cookies" : "wab";
}

// linkedin/enrich only: exactly one of target|targets must be present, and
// targets is capped at 10, narrower than the CLI's own direct 25-profile
// --via cookies limit (linkedinEnrichCookieLimit): the tool/API-routed path
// is also bounded by the Go API client's 300s request-cancel deadline
// (client.go) and other synchronous caller deadlines, none of which the
// original 25-target cap's ~600s worst case fit inside. A 10-target batch
// worst-cases ~170s, comfortably under all of them. Thrown errors surface as
// a 400 before wonda ever spawns, same as the salesnav-profile cap.
function enrichPositionals(payload: Payload): string[] {
  const hasTarget = payload.target !== undefined && payload.target !== null;
  const hasTargets = payload.targets !== undefined && payload.targets !== null;
  if (hasTarget === hasTargets) {
    throw new Error("Exactly one of target or targets is required");
  }
  if (hasTargets) {
    const targets = requiredStringArrayField(payload, "targets");
    if (targets.length === 0) {
      throw new Error("targets must have at least 1 item");
    }
    if (targets.length > 10) {
      throw new Error("targets must have at most 10 items");
    }
    return targets;
  }
  return [requiredStringField(payload, "target")];
}

function withMinCliVersion(
  spec: LocalActionSpec,
  minCliVersion: string,
  minCliVersionWhen?: (payload: Record<string, unknown>) => boolean,
): LocalActionSpec {
  return { ...spec, minCliVersion, minCliVersionWhen };
}

function withTimeout(
  spec: LocalActionSpec,
  timeoutMs: number,
): LocalActionSpec {
  return { ...spec, timeoutMs };
}

function withPreservePartialStdout(spec: LocalActionSpec): LocalActionSpec {
  return { ...spec, preservePartialStdout: true };
}

function derivePayloadFields(
  positionals: string[] | ((payload: Payload) => string[]),
  flags: FlagSpec[],
  media: MediaSpec | undefined,
): PayloadFieldSpec[] {
  const fields: PayloadFieldSpec[] = [];
  if (typeof positionals !== "function") {
    for (const name of positionals) {
      fields.push({ name, required: true, kind: "string" });
    }
  }
  for (const [flagOrFactory, field] of flags) {
    if (typeof flagOrFactory === "function" || field === undefined) continue;
    fields.push({ name: field, required: false, kind: "value" });
  }
  if (media !== undefined) {
    fields.push({
      name: "mediaRefs",
      required: false,
      kind: "stringArray",
      maxCount: media.maxCount,
    });
  }
  return fields;
}

function feedEngagePayloadFields(
  platform: LocalActionPlatform,
): PayloadFieldSpec[] {
  const fields: PayloadFieldSpec[] = [
    { name: "authors", required: false, kind: "stringArray" },
    { name: "keywords", required: false, kind: "stringArray" },
  ];
  if (platform === "reddit") {
    fields.push({ name: "subreddits", required: false, kind: "stringArray" });
  }
  fields.push(
    { name: "reply", required: false, kind: "value" },
    { name: "replyStyle", required: false, kind: "value" },
    { name: "personaReply", required: false, kind: "value" },
    { name: "relevanceThreshold", required: false, kind: "value" },
    { name: "relevancePrompt", required: false, kind: "string" },
    { name: "maxReply", required: false, kind: "value" },
    { name: "perDayCap", required: false, kind: "value" },
    { name: "maxScan", required: false, kind: "value" },
    { name: "dryRun", required: false, kind: "value" },
    { name: "durationMs", required: false, kind: "value" },
    { name: "maxEngage", required: false, kind: "value" },
    { name: "engageComments", required: false, kind: "value" },
    { name: "engageCommentsFrom", required: false, kind: "string" },
    { name: "maxCommentEngage", required: false, kind: "value" },
    { name: "navigate", required: false, kind: "string" },
    { name: "scrollMode", required: false, kind: "string" },
    { name: "scanIntervalMs", required: false, kind: "value" },
    { name: "reactions", required: false, kind: "stringArray" },
    { name: "expandPosts", required: false, kind: "value" },
  );
  return fields;
}

function positionalsFor(
  positionals: string[] | ((payload: Payload) => string[]),
  payload: Payload,
): string[] {
  if (typeof positionals === "function") return positionals(payload);
  return fields(payload, positionals);
}

function fields(payload: Payload, names: string[]): string[] {
  return names.map((name) => requiredStringField(payload, name));
}

function pushFlags(argv: string[], flags: FlagSpec[], payload: Payload): void {
  for (const spec of flags) {
    const [flagOrFactory, field] = spec;
    if (typeof flagOrFactory === "function") {
      const flag = flagOrFactory(payload);
      if (flag !== undefined) argv.push(flag);
      continue;
    }
    if (field === undefined) {
      throw new Error(`Missing payload field for ${flagOrFactory}`);
    }
    pushFlag(argv, flagOrFactory, payload[field]);
  }
}

function pushFlag(argv: string[], flag: string, value: unknown): void {
  if (!checkIsFlagActive(value)) return;
  if (value === true) {
    argv.push(flag);
    return;
  }
  argv.push(flag, stringValue(value));
}

// A boolean-style flag is active whenever pushFlag would emit it: any value that
// is not undefined/null/false. Used to gate the enrich-only URN cap.
function checkIsFlagActive(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function pushCsvFlag(argv: string[], flag: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.length === 0) return;
  argv.push(flag, value.map(stringValue).join(","));
}

// For StringArray CLI flags (no comma-splitting, so values may contain commas
// like "Berlin, Germany"): one flag occurrence per value.
function pushRepeatedFlag(argv: string[], flag: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) return;
  for (const v of value) argv.push(flag, stringValue(v));
}

function pushMedia(
  argv: string[],
  media: MediaSpec | undefined,
  payload: Payload,
): void {
  if (media === undefined || payload.mediaRefs === undefined) return;
  const refs = stringArrayField(payload, "mediaRefs");
  if (refs.length > media.maxCount) {
    throw new Error(`mediaRefs must have at most ${media.maxCount} items`);
  }
  for (const ref of refs) argv.push(media.flag, ref);
}

function pushCommonPagination(argv: string[], payload: Payload): void {
  pushFlag(argv, "--count", payload.count);
  pushFlag(argv, "--cursor", payload.cursor);
  pushFlag(argv, "--after", payload.after);
  pushFlag(argv, "--sort", payload.sort);
  pushFlag(argv, "--time", payload.time);
  pushFlag(argv, "--all", payload.all);
  pushFlag(argv, "--max-pages", payload.maxPages);
  if (payload.delayMs !== undefined) pushFlag(argv, "--delay", payload.delayMs);
}

function requirePayloadObject(payload: unknown): Payload {
  if (payload === undefined || payload === null) return {};
  if (!checkIsRecord(payload)) {
    throw new Error("payload must be an object");
  }
  return payload;
}

function requiredStringField(payload: Payload, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function optionalStringField(
  payload: Payload,
  field: string,
): string | undefined {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function stringArrayField(
  payload: Payload,
  field: string,
  fallback: string[] = [],
): string[] {
  const value = payload[field];
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map(stringValue).filter((item) => item.trim() !== "");
}

// Like stringArrayField, but REJECTS a blank entry instead of silently
// filtering it: a filtered-out blank shifts every later item's index versus
// the caller's original array (["alice", "", "bob"] would run "bob" as if it
// were the caller's index 1, not 2), which matters for a batch where the
// caller correlates results back to input position. Matches how the other
// two registries already reject blanks in this field (packages/features'
// z.array(targetSchema) fails the whole array; the twin-runner's
// validateStringArray throws via stringField).
function requiredStringArrayField(payload: Payload, field: string): string[] {
  const value = payload[field];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map((item, index) => {
    const text = stringValue(item);
    if (text.trim() === "") {
      throw new Error(`${field}[${index}] must not be blank`);
    }
    return text;
  });
}

function numberField(
  payload: Payload,
  field: string,
  fallback: number,
): number {
  const value = payload[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function stringValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  throw new Error(
    "payload values must be strings, numbers, booleans, or arrays",
  );
}

function checkIsRecord(value: unknown): value is Payload {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
