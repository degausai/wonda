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

Works with Claude Code · Cursor · Codex · Windsurf · Copilot · Cline · OpenCode · Zed — and any agent that can run shell commands.

<br />

<img src="assets/terminal.png" alt="wonda in action" width="560" />

</div>

## Install

![curl](https://img.shields.io/badge/curl-073551?style=flat-square&logo=curl&logoColor=white)

```bash
curl -fsSL https://wonda.sh/install.sh | bash
```

![Homebrew](https://img.shields.io/badge/Homebrew-FBB040?style=flat-square&logo=homebrew&logoColor=black)

```bash
brew tap degausai/tap && brew install wonda
```

![npm](https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white)

```bash
npm i -g @degausai/wonda
```

## Get started

```bash
wonda auth login          # Authenticate (opens browser)
wonda skill install -o .  # Install skill file for your AI assistant
```

Then ask your agent: *"Use wonda to generate a product video of this image."*

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

| Command | Description |
|---|---|
| `edit video` | Trim, crop, speed, overlay, merge, background removal, upscale, lip sync |
| `edit image` | Background removal, upscale, vectorize |
| `edit audio` | Audio editing operations |

### Publishing

| Command | Description |
|---|---|
| `publish instagram` | Publish a single post |
| `publish tiktok` | Publish a single post |
| `publish instagram-carousel` | Publish a carousel (2-10 images) |
| `publish tiktok-carousel` | Publish a photo carousel (2-35 images) |
| `publish history` | View publish history |

### Marketing & Analytics

| Command | Description |
|---|---|
| `scrape social` | Scrape Instagram/TikTok profiles (posts, engagement, bio) |
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

### Multi-step pipeline

```bash
# Generate video → add music → add text overlay
VID=$(wonda generate video --model sora2 --prompt "Ocean waves" --wait --quiet)
VID_MEDIA=$(wonda jobs get inference "$VID" --jq '.outputs[0].media.mediaId')

MUSIC=$(wonda generate music --model suno-music --prompt "lo-fi ambient" --wait --quiet)
MUSIC_MEDIA=$(wonda jobs get inference "$MUSIC" --jq '.outputs[0].media.mediaId')

wonda edit video --operation editAudio --media "$VID_MEDIA" --audio-media "$MUSIC_MEDIA" \
  --params '{"videoVolume":80,"audioVolume":30}' --wait -o final.mp4
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

## Pricing

An account is required. Sign up at [wonda.sh](https://wonda.sh).

Generations cost credits. Top up anytime:

```bash
wonda topup    # Opens Stripe checkout
wonda balance  # Check remaining credits
```

Use `wonda pricing estimate` to check costs before generating.

## Platforms

macOS · Linux · Windows — x64 + ARM64

## License

Proprietary — see [wonda.sh](https://wonda.sh) for terms.
