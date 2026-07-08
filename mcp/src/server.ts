import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { PlatformToolExecutor } from "./tools/platform.js";
import { registerResources } from "./resources/index.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerGenerateTools } from "./tools/generate.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerMediaTools } from "./tools/media.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerPublishTools } from "./tools/publish.js";
import { registerStatusTools } from "./tools/status.js";
import { registerTwinTools } from "./tools/twin.js";
import { registerWabTools } from "./tools/wab.js";
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

Generation, media, jobs and publish tools call the Wonda API over HTTPS using WONDA_API_KEY and consume account credits.`;

const REMOTE_INSTRUCTIONS = `Wonda connects you to the user's real social accounts (LinkedIn, X, Reddit, Instagram) plus AI media generation. This server runs in REMOTE mode: platform tools (linkedin_*, x_*, reddit_*, instagram_*) execute server-side on the account's cloud twin, a hosted browser session behind dedicated mobile/residential IPs that can run 24/7, or on the user's own paired machine when their local relay is online (engine policy auto | my_machine | cloud). "persona" is required for platform tools. Twin provisioning, schedules and campaigns are managed with the twin_* and campaign tools. Generation, media, jobs and publish tools call the Wonda API and consume account credits.`;

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
  registerStatusTools(server);
  registerWabTools(server);
  registerResources(server);

  return server;
}
