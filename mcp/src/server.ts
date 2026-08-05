import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { PlatformToolExecutor } from "./tools/platform.js";
import { registerResources } from "./resources/index.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerGenerateTools } from "./tools/generate.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerMediaTools } from "./tools/media.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerPublishTools } from "./tools/publish.js";
import { registerSequenceTools } from "./tools/sequence.js";
import { registerSkillTools } from "./tools/skills.js";
import { registerStatusTools } from "./tools/status.js";
import { registerTwinTools } from "./tools/twin.js";
import { registerWabTools } from "./tools/wab.js";
import { registerWhoamiTools } from "./tools/whoami.js";
import { checkIsLocalMode, PKG_VERSION } from "./version.js";

export const WONDA_MCP_SERVER_INFO = {
  name: "wonda",
  version: PKG_VERSION,
} as const;

const LOCAL_INSTRUCTIONS = `Wonda connects you to the user's real social accounts (LinkedIn, X, Reddit, Instagram) plus AI media generation. This server runs in LOCAL mode: platform tools (linkedin_*, x_*, reddit_*, instagram_*) execute on THIS machine by invoking the locally installed wonda CLI. Nothing runs in the cloud unless you explicitly use the twin_* or campaign tools.

- Read tools use the account's stored cookie session (fast, no browser window).
- Write tools drive the Wonda Automation Browser (WAB): a real, hardened Chrome window holding the account's logged-in session. It launches on demand, runs offscreen and hidden from the macOS Dock by default, and shuts down after idling. There is no application named "WAB"; when made visible the window is titled "Wonda · <persona>". To show it to the user, call the wab_show tool (wab_hide sends it back offscreen); to navigate it to a platform or URL, call wab_open; to see the current page yourself, call wab_screenshot (works offscreen). These run on the host directly: NEVER use a computer-use or desktop-control tool to open, drive, or screenshot the WAB, and once shown the user sees the window themselves. The wab_status tool lists persona browsers with PID and socket path, proving they are local processes.
- "account" selects the identity; the persona is derived automatically. Omit both to use the configured default account.
- If a platform session is missing or expired, or the user wants to connect a new account: call wab_login_open (opens the platform's login page in a visible WAB window; the user signs in themselves, 2FA included), wait for the user to say they finished, then wab_login_check to verify, then wab_open with the platform key once to sync cookies. NEVER type, request, or handle credentials yourself, and never retry failed write actions without asking. Cookie paste via \`wonda <platform> auth set ...\` in a terminal remains the fallback.
- First-time setup: \`wonda wab install\` downloads the stealth browser (~300 MB, one time). The first write triggers it automatically if missing.

Content skills are server-hosted, account-specific workflows. Before inventing a content or outreach workflow, call list_content_skills, then get_content_skill for the best match. The same catalog is available as wonda://skills and each guide as wonda://skills/{slug}. Skill bodies use CLI spelling; when working through MCP, translate an available command such as \`wonda linkedin search-posts\` to its corresponding tool such as linkedin_search_posts. Map identity and transport flags to top-level MCP arguments: use persona for the remote identity, account for the local account, and via for \`--via\`. Put only action-specific fields in payload, and omit CLI-only output flags such as \`--json\`, \`--jq\`, and \`--out\`. If no corresponding tool exists, say so instead of inventing one.

Generation, media, jobs and publish tools call the Wonda API over HTTPS using WONDA_API_KEY and consume account credits.

For durable automation, use sequence_validate → sequence_create → sequence_run or sequence_schedule. Sequences combine validated Wonda platform commands with waits, deterministic timing ranges, ordinary if/else rules, and bounded fan-out. Runs snapshot their definition and transport, so later edits never rewrite work in flight.`;

const REMOTE_INSTRUCTIONS = `Wonda connects you to the user's real social accounts (LinkedIn, X, Reddit, Instagram) plus AI media generation. This is the REMOTE connector: platform tools (linkedin_*, x_*, reddit_*, instagram_*) go through the Wonda backend, which routes each action to the best engine for the user. You do not choose the engine; the backend picks it (policy auto | my_machine | cloud). "persona" identifies the account/identity and is required for platform tools.

- If the user's Wonda Mac app is running (their local relay is online), the action runs on THEIR machine, in the Wonda Automation Browser (WAB): a real, hardened Chrome window holding the account's logged-in session, on the user's own IP with cookies kept on their device. It launches on demand and runs offscreen by default. This is NOT the cloud twin: the browser is on the user's Mac and the user can watch it.
- Otherwise the same action runs on the account's cloud twin: a hosted browser session behind dedicated mobile/residential IPs that can run 24/7.

When the relay is online you can drive the user's local WAB directly, WITHOUT any computer-use or desktop-control tool:
- wab_show / wab_hide surface or re-hide the window (titled "Wonda · <persona>") so the user can watch the live session.
- wab_open navigates it to a platform or URL; wab_screenshot captures what it is currently showing (for you to see); wab_status lists the personas and whether each browser is running.
- To connect a new account or refresh an expired session, call wab_login_open (opens the platform's login page in a visible WAB window so the USER signs in themselves, 2FA included), wait for the user to say they finished, then wab_login_check to verify. NEVER type, request, or handle credentials yourself.
The wab_* tools act on the user's Mac and need their Wonda app online; when it is offline they return a clear "your machine is offline" error, and the cloud twin has its own login flow (twin_login_*).

Twin provisioning, schedules and campaigns are managed with the twin_* and campaign tools. Content skills are server-hosted, account-specific workflows: before inventing a content or outreach workflow, call list_content_skills, then get_content_skill for the best match. The same catalog is available as wonda://skills and each guide as wonda://skills/{slug}. Skill bodies use CLI spelling; when working through MCP, translate an available command such as \`wonda linkedin search-posts\` to its corresponding tool such as linkedin_search_posts. Map identity and transport flags to top-level MCP arguments: use persona for the remote identity, account for the local account, and via for \`--via\`. Put only action-specific fields in payload, and omit CLI-only output flags such as \`--json\`, \`--jq\`, and \`--out\`. If no corresponding tool exists, say so instead of inventing one. Generation, media, jobs and publish tools call the Wonda API and consume account credits.

For durable automation, use sequence_validate → sequence_create → sequence_run or sequence_schedule. Sequences combine validated Wonda platform commands with waits, deterministic timing ranges, ordinary if/else rules, and bounded fan-out. Runs snapshot their definition and transport, so later edits never rewrite work in flight. Relay-pinned sequences can run every generated LinkedIn, Sales Navigator, X and Reddit command on the user's Mac, including local-only commands such as X DMs.`;

export type CreateWondaMcpServerOptions = {
  platformToolExecutor?: PlatformToolExecutor;
};

export function createWondaMcpServer(
  options: CreateWondaMcpServerOptions = {},
): McpServer {
  const server = new McpServer(WONDA_MCP_SERVER_INFO, {
    instructions: checkIsLocalMode() ? LOCAL_INSTRUCTIONS : REMOTE_INSTRUCTIONS,
  });

  registerGenerateTools(server);
  // Editor operations (trim/crop/merge/animatedCaptions/textOverlay/...) moved
  // to the local wonda CLI in the local-editor-ops cleanup. The public API
  // returns 410 Gone for them. The MCP server is a thin HTTP client with no
  // local ffmpeg, so there is no execution path; the edit tools were removed
  // rather than left to loop on 410s. Editing is a `wonda edit ...` CLI task.
  registerMediaTools(server);
  registerJobTools(server);
  registerPublishTools(server);
  registerTwinTools(server);
  registerPlatformTools(server, options.platformToolExecutor);
  registerCampaignTools(server);
  // The sequencer is server-side state (a stored definition plus its executions
  // draining on the backend's own clock), so it is an HTTPS API tool in BOTH
  // modes: there is no local variant, and there is nothing sensible to run on
  // this machine for a step that lands in three days. The API gates the whole
  // surface on the per-account sequencerEnabled flag, which fails closed, so an
  // account without it gets a clear "not enabled" from every tool here.
  registerSequenceTools(server);
  // The calendar is an HTTPS API tool in both modes: it reads server-side state
  // (twin schedules and the action ledger), so there is no local-only variant to
  // gate on.
  registerCalendarTools(server);
  registerStatusTools(server);
  registerWhoamiTools(server);
  registerSkillTools(server);
  registerWabTools(server);
  registerResources(server);

  return server;
}
