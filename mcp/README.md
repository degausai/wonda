# @degausai/wonda-mcp

MCP server for [Wonda](https://wonda.sh). Drive your real LinkedIn, X, Reddit, and Instagram accounts from any MCP client (Claude Desktop, Claude Cowork, Claude Code, Cursor, ...), either locally through the Wonda Automation Browser on your machine or 24/7 on a hosted cloud twin. Plus AI media generation and publishing.

## Setup

### Local mode, `.mcpb` bundle (Claude Desktop, Claude Cowork, Claude Code)

Download the MCPB for your Mac CPU from a [Wonda CLI release](https://github.com/degausai/wonda/releases) (`wonda-darwin-arm64.mcpb` for Apple Silicon, `wonda-darwin-amd64.mcpb` for Intel, ~18 MB) and open it with Claude Desktop. The bundle runs this MCP server locally with `WONDA_MCP_MODE=local`, so LinkedIn, Reddit, X, and Instagram tools execute through the bundled `wonda` binary against your on-device Wonda Automation Browser and local cookie store.

During install, Claude prompts for your Wonda API key and stores it in the OS keychain. The key is used for API metering and the generation/media tools. Platform cookies stay in `~/.wonda/` and are read only by the local `wonda` binary.

The bundle is macOS-only because it embeds the signed macOS `wonda` binary.

Claude Cowork runs local MCP servers on the host machine (outside its sandbox VM), so local mode works in Cowork sessions, including WAB writes. Claude web cannot load local servers and needs the remote connector instead.

### Local mode, npx (any MCP client, requires the wonda CLI installed)

If you already have the [wonda CLI](https://wonda.sh) installed (`curl -fsSL https://wonda.sh/install.sh | bash`, `brew install degausai/tap/wonda`, or `npx @degausai/wonda`):

```json
{
  "mcpServers": {
    "wonda": {
      "command": "npx",
      "args": ["-y", "@degausai/wonda-mcp"],
      "env": {
        "WONDA_MCP_MODE": "local",
        "WONDA_BIN": "/absolute/path/to/wonda",
        "WONDA_API_KEY": "sk_your_api_key",
        "WONDA_DEFAULT_ACCOUNT": "your-account"
      }
    }
  }
}
```

Use absolute paths for `command` and `WONDA_BIN`: GUI apps do not inherit your shell PATH.

### Remote mode, npx (platform actions run on your cloud twin)

Same config without `WONDA_MCP_MODE` and `WONDA_BIN`:

```json
{
  "mcpServers": {
    "wonda": {
      "command": "npx",
      "args": ["-y", "@degausai/wonda-mcp"],
      "env": { "WONDA_API_KEY": "sk_your_api_key" }
    }
  }
}
```

Platform tools then execute server-side on your provisioned cloud twin (or on your own paired machine when the local relay is online, see Cloud twin below). `persona` is required on every platform tool call.

### Remote connector (Claude web)

Add the hosted connector in Claude settings; it authenticates with OAuth and never sees your `sk_...` key. See [wonda.sh](https://wonda.sh) → Connect Claude for the current connector URL.

### Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  wonda:
    command: "npx"
    args: ["-y", "@degausai/wonda-mcp"]
    env:
      WONDA_API_KEY: "sk_..."
```

## Get an API key

1. Sign up at [wonda.sh](https://wonda.sh)
2. Go to Settings → API Keys
3. Or use the CLI: `wonda auth login`

## The Wonda Automation Browser (WAB)

The WAB is a premium stealth antidetect Chromium, hardened so platforms cannot fingerprint it as automation: real-browser TLS, canvas/WebGL, fonts, and trusted input events, not a detectable headless Chrome. It holds signed-in sessions for every platform in a single browser per persona, spawned on demand and idled out after inactivity.

Things worth knowing when an agent drives it:

- **One persona = one browser profile** under `~/.wonda/wab/personas/<name>/`. Different personas have different cookies, profile, and fingerprint. In the common case one persona per account is auto-created on first use and named after the account.
- **It runs offscreen by default.** The window is real (no headless fingerprint) but rendered off-viewport and hidden from the macOS Dock. There is no application named "WAB": when surfaced, the window is titled **"Wonda · \<persona\>"**. The `wab_show` MCP tool (or `wonda wab show <persona>`) brings it on screen; `wab_hide` sends it back; `wab_open` navigates it to a platform or URL. `wab_status` lists persona browsers with PID and socket path. Agents never need a computer-use tool for any of this.
- **One-time install**: `wonda wab install` downloads the stealth browser and Chromium (~300 MB). The first write action triggers it automatically if missing.

## Transports: `wab` vs `cookies`

Every platform action runs over one of two transports. The MCP server picks it per action; you never choose.

- **cookies**: a flat per-account cookie store driven through a Chrome-fingerprinted HTTP client. Fast, no browser window.
- **wab**: the action runs inside the persona's WAB, so cookies and TLS fingerprint come from a real browser session.

Rules of thumb: **reads go via cookies, writes go via wab** (the cookie-API path trips anti-abuse heuristics on writes at any meaningful volume). Exceptions: `linkedin_search_posts` reads via wab; Reddit reads use a direct Chrome-fingerprinted client and cannot use wab; Reddit writes are wab-only.

## Sessions: how accounts get logged in

The MCP server never types or handles credentials. In local mode, agents can drive the flow with the `wab_login_open` tool (opens the platform's login page in a visible WAB window; the user signs in, 2FA included) followed by `wab_login_check` to verify. Under the hood and from a terminal:

- **Recommended**: `wonda wab login <account> <platform>` opens a visible WAB window and you log in there. The session is born under the WAB's own fingerprint, so session and browser identity stay coherent.
- **Fallback (cookie paste)**: `wonda linkedin auth set --li-at-value ... --jsessionid-value ...`, `wonda x auth set --auth-token ... --ct0 ...`, `wonda reddit auth set --cookies "$(pbpaste)"`, `wonda instagram auth set --sessionid ...`.
- **Verify safely** with `wonda <platform> auth check --account <name> --via wab`. Never probe freshly pasted cookies from a raw HTTP client.

For cloud twins, see `twin_seed_from_cookies`, `twin_login_automated`, and `twin_needs_auth_view` below.

## LinkedIn tools (53)

Reads (36): `linkedin_me`, `linkedin_search`, `linkedin_profile`, `linkedin_posts`, `linkedin_analytics`, `linkedin_comments`, `linkedin_search_posts`, `linkedin_saves`, `linkedin_reactions`, `linkedin_company`, `linkedin_conversations`, `linkedin_messages`, `linkedin_notifications`, `linkedin_connections`, `linkedin_sent_invitations`, `linkedin_invitations`, `linkedin_connection_status`, `linkedin_enrich`, `linkedin_activity`, `linkedin_comment_reactors`, `linkedin_enrich_engagers`, plus the Sales Navigator suite: `linkedin_salesnav_search`, `linkedin_salesnav_profile`, `linkedin_salesnav_insights`, `linkedin_salesnav_warm_intro`, `linkedin_salesnav_spotlights`, `linkedin_salesnav_typeahead`, `linkedin_salesnav_facets`, `linkedin_salesnav_recommended_leads`, `linkedin_salesnav_recommended_companies`, `linkedin_salesnav_lists`, `linkedin_salesnav_alerts`, `linkedin_salesnav_notifications`, `linkedin_salesnav_personas`, `linkedin_salesnav_recent`, `linkedin_salesnav_saved_searches`

Writes (17): `linkedin_post`, `linkedin_comment`, `linkedin_reply_comment`, `linkedin_like`, `linkedin_unlike`, `linkedin_connect`, `linkedin_send_message`, `linkedin_inmail`, `linkedin_visit`, `linkedin_mute`, `linkedin_edit_post`, `linkedin_delete_post`, `linkedin_edit_comment`, `linkedin_feed_engage`, `linkedin_engage_commenters`, `linkedin_follow`, `linkedin_delete_comment`

`linkedin_feed_engage` engages the feed on a filter (authors, keywords) for a bounded duration; `linkedin_engage_commenters` likes/comments/connects with the commenters of one post. Both are bounded write loops with dry-run support.

Sales Navigator tools require a Sales Navigator subscription on the account and run over the cookie session. `linkedin_enrich_engagers` is a long-running fan-out read (per-profile fetches with human pacing); with `profileSource: "public"` it calls the paid public-data API and consumes credits.

## X tools (35)

Reads (19): `x_search`, `x_user_tweets`, `x_read`, `x_analytics`, `x_user`, `x_replies`, `x_thread`, `x_home`, `x_bookmarks`, `x_likes`, `x_following`, `x_followers`, `x_lists`, `x_list_timeline`, `x_news`, `x_mentions`, `x_dm_inbox`, `x_dm_read`, `x_dm_requests`

Writes (16): `x_tweet`, `x_reply`, `x_quote`, `x_like`, `x_unlike`, `x_bookmark`, `x_unbookmark`, `x_retweet`, `x_unretweet`, `x_follow`, `x_unfollow`, `x_delete`, `x_feed_engage`, `x_dm_send`, `x_dm_accept`, `x_dm_start`

`x_tweet`, `x_reply`, and `x_quote` accept up to 4 `mediaRefs` attachments. DM writes additionally require a pre-saved encrypted XChat passcode (`wonda x dm passcode set`, terminal-only).

## Reddit tools (29)

Reads (17): `reddit_search`, `reddit_subreddit`, `reddit_rules`, `reddit_feed`, `reddit_comments`, `reddit_user`, `reddit_whoami`, `reddit_user_posts`, `reddit_user_comments`, `reddit_post`, `reddit_analytics`, `reddit_trending`, `reddit_home`, `reddit_saved`, `reddit_inbox`, `reddit_chat_inbox`, `reddit_chat_messages`

Writes (12): `reddit_submit`, `reddit_comment`, `reddit_vote`, `reddit_subscribe`, `reddit_save`, `reddit_unsave`, `reddit_delete`, `reddit_feed_engage`, `reddit_chat_send`, `reddit_chat_start`, `reddit_chat_accept`, `reddit_chat_accept_all`

Reddit transport is fixed per command kind: reads run direct via a Chrome-fingerprinted HTTP client (fast, ~700ms p50), writes dispatch through the account's WAB so the mutations carry a real-browser fingerprint.

## Instagram tools (4)

Reads: `instagram_saved`, `instagram_comments`. Writes: `instagram_comment`, `instagram_feed_engage`. Feed publishing goes through `publish_instagram` (Graph API) instead.

## Cloud twin

A cloud twin is a hosted, server-side copy of a social persona: it runs in an isolated browser environment behind dedicated mobile/residential IPs pinned to a region. Use it when the account should keep working **24/7 even when your laptop is closed**, and to keep automation egress off your personal IP entirely. Local WAB and cloud twin are complementary: local is free with your machine open; the twin is the always-on, safe-environment option.

With a twin provisioned, remote-mode platform tools run on it. The engine policy (`auto | my_machine | cloud`) decides where each action executes: `wonda relay pair` pairs your own machine so actions prefer your real device and IP when it is online, falling back to the cloud twin otherwise.

Provisioning and lifecycle: `provision_twin`, `list_twins`, `show_twin`, `update_twin`, `pause_twin`, `resume_twin`, `run_now_twin`

Safety and allowances: `twin_can_act`, `twin_action_allowance`, `twin_health`, `twin_limits`, `set_twin_limits`

Runs and schedules: `list_twin_runs`, `get_twin_output`, `cancel_twin_run`, `list_twin_schedules`, `create_twin_schedule`, `update_twin_schedule`, `delete_twin_schedule`

Auth and seeding: `twin_seed_from_cookies` (seed a twin profile from stored cookies), `twin_login_automated` (automated onboarding; returns a human-gated `viewerUrl` when needed), `twin_login_status`, `twin_needs_auth_view` (mint a hosted login view URL)

Autopilot: `run_campaign` (one bounded autonomous campaign, approved once) and `schedule_loop` (recurring autonomous loop on a cron, same server-side caps).

## Other tools

| Tool                                                                     | Description                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| `generate_image` / `generate_video` / `generate_text` / `generate_music` | Generate media from a prompt                     |
| `speech` / `transcribe` / `dialogue`                                     | TTS, STT, multi-speaker dialogue                 |
| `analyze_video`                                                          | Extract frame grid + transcript from video       |
| `upload_media` / `get_media` / `list_media`                              | Media library                                    |
| `get_inference_job` / `get_editor_job` / `get_publish_job`               | Poll job status                                  |
| `publish_instagram` / `publish_tiktok`                                   | Publish media to connected accounts              |
| `wonda_status`                                                           | Installed binary version vs latest/min supported |
| `wab_status` (local mode only)                                           | Running WAB personas with PID and socket path    |
| `wab_show` / `wab_hide` (local mode only)                                | Surface the WAB window on screen / send it back  |
| `wab_open` (local mode only)                                             | Navigate the WAB to a platform or URL            |
| `wab_login_open` / `wab_login_check` (local mode only)                   | Open a platform login in the WAB / verify it     |
| `wab_screenshot` (local mode only)                                       | Capture the WAB's current page as a PNG          |

Media editing (trim, captions, overlays, ...) is a `wonda edit ...` CLI task, not an MCP tool.

## Consent hints

Platform read actions are tagged read-only for Always-allow clients; write actions are tagged non-read-only and destructive so clients request approval. Tools without a cloud-twin counterpart (the `x_dm_*` group; DMs are end-to-end encrypted with a locally stored passcode) are registered in local mode only. `run_campaign` and `schedule_loop` are the one-approval autopilot tools; the per-verb platform tools remain the supervised path.

## Resources

| Resource     | URI                    | Description                    |
| ------------ | ---------------------- | ------------------------------ |
| Balance      | `wonda://balance`      | Credit balance and refill time |
| Capabilities | `wonda://capabilities` | All models and operations      |
| Twins        | `wonda://twins`        | Provisioned twins with status  |

## Environment Variables

| Variable                | Required           | Description                                                        |
| ----------------------- | ------------------ | ------------------------------------------------------------------ |
| `WONDA_API_KEY`         | Yes for HTTP tools | Your Wonda API key (`sk_...`)                                      |
| `WONDA_BASE_URL`        | No                 | Override API base URL (default: `https://api.wondercat.ai/api/v1`) |
| `WONDA_MCP_MODE`        | No                 | Set to `local` to run platform action tools through local `wonda`  |
| `WONDA_BIN`             | No                 | Path to the local or bundled `wonda` binary                        |
| `WONDA_DEFAULT_ACCOUNT` | No                 | Default local WAB persona or account label                         |

## License

MIT
