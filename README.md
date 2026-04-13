<div align="center">

<img src="assets/banner.png" alt="wonda" width="600" />

**AI-powered content generation from your terminal**

Images, video, music, audio, editing, and social publishing — all via CLI.

[![Latest Release](https://img.shields.io/github/v/release/degausai/wonda?style=flat-square&color=7c3aed&label=latest)](https://github.com/degausai/wonda/releases)
[![npm](https://img.shields.io/npm/v/@degausai/wonda?style=flat-square&color=7c3aed&label=npm)](https://www.npmjs.com/package/@degausai/wonda)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Linux%20·%20Windows-7c3aed?style=flat-square)](#platforms)
[![Website](https://img.shields.io/badge/wonda.sh-7c3aed?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMiAxMmgyME0xMiAyYTE1LjMgMTUuMyAwIDAgMSA0IDEwIDE1LjMgMTUuMyAwIDAgMS00IDEwIDE1LjMgMTUuMyAwIDAgMS00LTEwIDE1LjMgMTUuMyAwIDAgMSA0LTEweiIvPjwvc3ZnPg==)](https://wonda.sh)

---

**You don't need to learn this CLI. Your agent already knows how to use it.**

![Claude Code](https://img.shields.io/badge/Claude_Code-d97706?style=flat-square)
![Cursor](https://img.shields.io/badge/Cursor-000?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-10a37f?style=flat-square)
![Windsurf](https://img.shields.io/badge/Windsurf-0ea5e9?style=flat-square)
![Copilot](https://img.shields.io/badge/Copilot-2b3137?style=flat-square)
![Cline](https://img.shields.io/badge/Cline-ec4899?style=flat-square)
![OpenCode](https://img.shields.io/badge/OpenCode-6366f1?style=flat-square)
![Zed](https://img.shields.io/badge/Zed-8b5cf6?style=flat-square)

and any agent that can run shell commands.

<br />

<img src="assets/terminal.gif" alt="wonda in action" width="560" />

</div>

## Install

![npm](https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white)

```bash
npm i -g @degausai/wonda
```

![Homebrew](https://img.shields.io/badge/Homebrew-FBB040?style=flat-square&logo=homebrew&logoColor=black)

```bash
brew tap degausai/tap && brew install wonda
```

## Get started

```bash
wonda auth login          # Authenticate (opens browser)
wonda skill install -o .  # Install skill file for your AI assistant
```

Then ask your agent: *"Use wonda to generate a product video of this image."*

## Agent plugin

Wonda ships as a native plugin for AI coding agents. Install it once and your agent learns every command, model, and workflow automatically.

| Agent | Install |
|---|---|
| Any agent | `npx skills add degausai/wonda` |
| Claude Code | `/plugin marketplace add degausai/wonda` then `/plugin install wonda@degausai` |
| Gemini CLI | `gemini extensions install https://github.com/degausai/wonda` |
| Project-local | `wonda skill install -o .` |

## Made with wonda

<p align="center">
<img src="assets/example-1.webp" alt="Product content" width="140" />&nbsp;&nbsp;
<img src="assets/example-3.webp" alt="AI-generated content" width="140" />&nbsp;&nbsp;
<img src="assets/example-5.webp" alt="Ad creative" width="140" />&nbsp;&nbsp;
<img src="assets/example-4.webp" alt="Product ad" width="140" />
</p>

<p align="center"><em>Product videos, UGC-style content, ad creatives — generated, edited, and published from the terminal.</em></p>

## Pricing

An account is required. Sign up at [wonda.sh](https://wonda.sh).

Generations cost credits. Top up anytime:

```bash
wonda topup    # Add credits
wonda balance  # Check remaining credits
```

Use `wonda pricing estimate` to check costs before generating.

## Commands

### Generation

| Command | Description |
|---|---|
| `generate image` | Generate an image from a text prompt |
| `generate video` | Generate a video from a text prompt or reference image |
| `generate text` | Generate text content |
| `generate music` | Generate a music track from a text prompt |
| `audio speech` | Text-to-speech |
| `audio transcribe` | Speech-to-text |
| `audio dialogue` | Multi-speaker dialogue generation |

### Editing

TikTok/Reels-style video editing operations — designed for short-form social content.

| Operation | What it does |
|---|---|
| `animatedCaptions` | Auto-transcribe and burn animated word-by-word captions |
| `textOverlay` | Add styled text with custom fonts, positions, and sizing |
| `editAudio` | Mix background music with video audio (volume control) |
| `merge` | Stitch multiple clips into one video |
| `overlay` | Picture-in-picture — layer one video over another |
| `splitScreen` | Side-by-side or top-bottom split of two videos |
| `trim` | Cut to a specific time range |
| `speed` | Speed up or slow down |
| `splitScenes` | Auto-detect and split scenes (or omit a scene) |
| `extractAudio` | Pull the audio track from a video |
| `extractFrame` | Extract a single frame at a specific timestamp |
| `reverseVideo` | Play backwards |
| `skipSilence` | Remove silent gaps |
| `motionDesign` | Motion design and animation |
| `enhanceAudio` | Enhance audio quality |
| `voiceExtractor` | Isolate vocals from audio |
| `audioTrim` | Trim audio files |
| `imageToVideo` | Convert images to video |
| `imageCrop` | Crop to a target aspect ratio |
| `birefnet-bg-removal` | Remove image background |
| `bria-video-background-removal` | Remove video background |
| `topaz-video-upscale` | Upscale video resolution (1-4x) |
| `sync-lipsync-v2-pro` | Sync lip movements to audio |

### Analysis

| Command | Description |
|---|---|
| `analyze video` | Extract composite frame grid + audio transcript for video understanding |

### Publishing

| Command | Description |
|---|---|
| `publish instagram` | Publish a single post |
| `publish tiktok` | Publish a single post |
| `publish instagram-carousel` | Publish a carousel (2-10 images) |
| `publish tiktok-carousel` | Publish a photo carousel (2-35 images) |
| `publish history` | View publish history |

### LinkedIn

Supports search, profiles, companies, messaging, and engagement.

| Command | Description |
|---|---|
| `linkedin auth set` | Store LinkedIn session credentials (see `wonda linkedin auth --help`) |
| `linkedin auth check` | Verify stored session validity |
| `linkedin me` | Your LinkedIn identity |
| `linkedin search` | Search people, companies, or all (`--type PEOPLE\|COMPANIES\|ALL`) |
| `linkedin profile` | View a profile by vanity name or URL (includes follower count) |
| `linkedin posts` | Recent posts with engagement stats (`--comments` to include top comments) |
| `linkedin comments` | Get comments on a specific post |
| `linkedin company` | View a company page |
| `linkedin conversations` | List message threads |
| `linkedin messages` | Read messages in a thread |
| `linkedin notifications` | Recent notifications |
| `linkedin connections` | Your connections |
| `linkedin like` | Like a post |
| `linkedin unlike` | Remove a like |
| `linkedin send-message` | Send a message in a conversation |
| `linkedin post` | Create a LinkedIn post (`--visibility ANYONE\|CONNECTIONS_ONLY`) |
| `linkedin delete-post` | Delete a post |

### X/Twitter

Supports search, timelines, tweets, and social graph.

| Command | Description |
|---|---|
| `x auth set` | Store X session credentials (see `wonda x auth --help`) |
| `x auth check` | Verify stored session validity |
| `x search` | Search tweets |
| `x user` | User profile |
| `x user-tweets` | User's recent tweets |
| `x read` | Read a single tweet |
| `x replies` | Replies to a tweet |
| `x thread` | Full thread (author's self-replies) |
| `x home` | Home timeline (`--following` for Following tab) |
| `x bookmarks` | Your bookmarks |
| `x likes` | Your liked tweets |
| `x following` | Who a user follows |
| `x followers` | A user's followers |
| `x lists` | User's lists (`--member-of` for memberships) |
| `x list-timeline` | Tweets from a list |
| `x news` | Trending topics (`--tab trending\|for_you\|news\|sports\|entertainment`) |
| `x tweet` | Post a tweet |
| `x reply` | Reply to a tweet |
| `x like` | Like a tweet |
| `x unlike` | Unlike a tweet |
| `x retweet` | Retweet |
| `x unretweet` | Unretweet |
| `x follow` | Follow a user |
| `x unfollow` | Unfollow a user |

### Reddit

| Command | Description |
|---|---|
| `reddit submit` | Submit a self or link post to a subreddit |
| `reddit comment` | Reply to a post or comment |
| `reddit vote` | Upvote or downvote |
| `reddit subscribe` | Subscribe to a subreddit |
| `reddit save` | Save a post |
| `reddit delete` | Delete your post |
| `reddit chat inbox` | List DM conversations |
| `reddit chat messages` | Fetch messages from a conversation |
| `reddit chat send` | Send a DM |
| `reddit chat accept-all` | Accept pending chat requests |

### Marketing & Analytics

| Command | Description |
|---|---|
| `scrape social` | Scrape Instagram/TikTok/Reddit profiles (posts, engagement, bio) |
| `scrape ads` | Search the Meta Ads Library for competitor ads |
| `analytics instagram\|tiktok` | Performance metrics for connected accounts |
| `brand` | View brand identity, products, website data |

### Media & Workflows

| Command | Description |
|---|---|
| `media upload\|download\|list` | Media library management |
| `blueprint list\|create\|run` | Blueprint workflow management |
| `skill list\|get\|install` | AI agent skill files and content guides |
| `models list\|info` | Available models and their parameters |
| `pricing list\|estimate` | Pricing info and cost estimates |

## Examples

### Generate an image

```bash
wonda generate image \
  --model nano-banana-2 \
  --prompt "Product photo of headphones on marble" \
  --wait -o photo.png
```

### Generate a video from a reference image

```bash
MEDIA=$(wonda media upload ./product.jpg --quiet)
wonda generate video --model sora2 \
  --prompt "Slow orbit, dramatic lighting" \
  --attach "$MEDIA" --duration 8 --wait -o video.mp4
```

### Add animated captions (TikTok-style)

```bash
wonda edit video --operation animatedCaptions --media "$VID_MEDIA" \
  --params '{"fontFamily":"TikTok Sans","position":"bottom-center","highlightColor":"#FFD700"}' \
  --wait -o captioned.mp4
```

### Full pipeline: generate → music → captions → publish

```bash
# Generate a product video
VID=$(wonda generate video --model sora2 --prompt "Ocean waves" --wait --quiet)
VID_MEDIA=$(wonda jobs get inference "$VID" --jq '.outputs[0].media.mediaId')

# Add background music
MUSIC=$(wonda generate music --model suno-music --prompt "lo-fi ambient" --wait --quiet)
MUSIC_MEDIA=$(wonda jobs get inference "$MUSIC" --jq '.outputs[0].media.mediaId')
MIXED=$(wonda edit video --operation editAudio --media "$VID_MEDIA" --audio-media "$MUSIC_MEDIA" \
  --params '{"videoVolume":80,"audioVolume":30}' --wait --quiet)
MIXED_MEDIA=$(wonda jobs get editor "$MIXED" --jq '.outputs[0].mediaId')

# Burn in animated captions
FINAL=$(wonda edit video --operation animatedCaptions --media "$MIXED_MEDIA" \
  --params '{"fontFamily":"Montserrat","position":"bottom-center"}' --wait --quiet)
FINAL_MEDIA=$(wonda jobs get editor "$FINAL" --jq '.outputs[0].mediaId')

# Publish
wonda publish tiktok --media "$FINAL_MEDIA" --account tiktok_acct_123 \
  --caption "Summer vibes" --privacy-level PUBLIC_TO_EVERYONE
```

### Publish to Instagram

```bash
wonda publish instagram \
  --media med_abc123 \
  --account ig_acct_456 \
  --caption "New drop. Link in bio."
```

## Output formats

All commands output JSON to stdout. Errors go to stderr.

```bash
# Default — formatted JSON
wonda generate image --model nano-banana-2 --prompt "A cat"

# Quiet — just the ID, useful for shell variables
JOB=$(wonda generate image --model nano-banana-2 --prompt "A cat" --quiet)

# Field selection
wonda jobs get inference "$JOB" --fields status,outputs

# Built-in jq (no external dependency)
wonda generate image --model nano-banana-2 --prompt "A cat" --wait \
  --jq '.outputs[0].media.url'
```

When stdout is piped, JSON mode is enabled automatically.

## AI agent integration

Just point your agent at `wonda` — it reads `--help`, finds the built-in skill file, and figures out model selection, prompt strategies, and content workflows on its own.

```bash
wonda skill install              # Sync skill file to ~/.wonda/skill/
wonda skill install --all -o .   # Install main + all content skills locally
wonda skill list                 # Browse available content skills
wonda skill get product-b-roll   # Fetch a specific content guide
```

The skill file auto-syncs in the background. No configuration needed — your agent discovers it automatically.

## Platforms

macOS · Linux · Windows — x64 + ARM64

## License

Proprietary — see [wonda.sh](https://wonda.sh) for terms.
