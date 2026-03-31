# wonda

AI-powered content generation from your terminal — images, video, music, audio, editing, and social publishing.

**Agent-first**: tell your AI agent to use `wonda` and it will figure it out from `--help` and the built-in skill files.

[Website](https://wonda.sh) · [Docs](https://wonda.sh/docs) · [Releases](https://github.com/degausai/wonda/releases)

## Install

```bash
curl -fsSL https://wonda.sh/install.sh | bash
```

```bash
brew tap degausai/tap && brew install wonda
```

```bash
npm i -g @degausai/wonda
```

## Get started

```bash
wonda auth login          # Authenticate
wonda skill install -o .  # Install skill file for your AI assistant
```

Then ask your agent: *"Use wonda to generate a product video of this image."*

## What it does

- **Generate** — images, video, music, speech, dialogue, text
- **Edit** — trim, crop, overlay, background removal, upscale, lip sync
- **Publish** — Instagram and TikTok posts + carousels
- **Analyze** — scrape profiles, search ad libraries, view analytics

All output is JSON. Pipe-friendly with `--quiet`, `--jq`, and `--fields`.

## Pricing

An account is required. Sign up at [wonda.sh](https://wonda.sh).

Generations cost credits. Top up anytime with `wonda topup`.

## Platforms

macOS · Linux · Windows (x64 + ARM64)

## License

Proprietary — see [wonda.sh](https://wonda.sh) for terms.
