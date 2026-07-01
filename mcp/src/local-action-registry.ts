export type LocalActionKind = "read" | "write";
export type LocalActionPlatform = "linkedin" | "reddit" | "x" | "instagram";

export type LocalActionSpec = {
  platform: LocalActionPlatform;
  action: string;
  kind: LocalActionKind;
  requestedSlots: Record<string, number>;
  variableSlots: boolean;
  toolName: string;
  buildArgv: (payload: unknown, persona: string, account?: string) => string[];
};

type Payload = Record<string, unknown>;
type FlagSpec =
  | [flag: string, field: string]
  | [flagFromPayload: (payload: Payload) => string | undefined];
type MediaSpec = { flag: "--media" | "--attach"; maxCount: number };

const DEFAULT_DURATION_MS = 120_000;
const MAX_DURATION_MS = 180_000;
const ENGAGE_COMMENTERS_DEFAULT_DURATION_MS = 180_000;

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
      ["--yes-consume-credit", "yesConsumeCredit"],
      ["--dry-run", "dryRun"],
    ],
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
  read("linkedin", "enrich", ["target"]),

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
}): LocalActionSpec {
  return {
    platform: args.platform,
    action: args.action,
    kind: args.kind,
    requestedSlots: args.requestedSlots,
    variableSlots: args.variableSlots,
    toolName: `${args.platform}_${args.action.replaceAll("-", "_")}`,
    buildArgv(payload, persona, account) {
      const parsed = requirePayloadObject(payload);
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
        args.via ?? viaForKind(args.kind),
      ];
      if (args.kind === "write") argv.push("--no-auto-persona");
      pushFlags(argv, args.flags, parsed);
      pushMedia(argv, args.media, parsed);
      pushCommonPagination(argv, parsed);
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
  if (value === undefined || value === null || value === false) return;
  if (value === true) {
    argv.push(flag);
    return;
  }
  argv.push(flag, stringValue(value));
}

function pushCsvFlag(argv: string[], flag: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.length === 0) return;
  argv.push(flag, value.map(stringValue).join(","));
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
