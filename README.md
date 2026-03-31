<div align="center">

# wonda

**AI-powered content generation from your terminal**

Images, video, music, audio, editing, and social publishing — all via CLI.

[![Latest Release](https://img.shields.io/github/v/release/degausai/wonda?style=flat-square&color=7c3aed&label=latest)](https://github.com/degausai/wonda/releases)
[![npm](https://img.shields.io/npm/v/@degausai/wonda?style=flat-square&color=7c3aed&label=npm)](https://www.npmjs.com/package/@degausai/wonda)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Linux%20·%20Windows-7c3aed?style=flat-square)](#platforms)
[![Website](https://img.shields.io/badge/wonda.sh-7c3aed?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMiAxMmgyME0xMiAyYTE1LjMgMTUuMyAwIDAgMSA0IDEwIDE1LjMgMTUuMyAwIDAgMS00IDEwIDE1LjMgMTUuMyAwIDAgMS00LTEwIDE1LjMgMTUuMyAwIDAgMSA0LTEweiIvPjwvc3ZnPg==)](https://wonda.sh)

---

**Agent-first** — tell your AI agent to use `wonda`. It figures it out from `--help` and built-in skill files.

</div>

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

| | |
|---|---|
| **Generate** | images, video, music, speech, dialogue, text |
| **Edit** | trim, crop, overlay, background removal, upscale, lip sync |
| **Publish** | Instagram and TikTok posts + carousels |
| **Analyze** | scrape profiles, search ad libraries, view analytics |

All output is JSON. Pipe-friendly with `--quiet`, `--jq`, and `--fields`.

## Pricing

An account is required. Sign up at [wonda.sh](https://wonda.sh).

Generations cost credits. Top up anytime with `wonda topup`.

## Platforms

macOS · Linux · Windows — x64 + ARM64

## License

Proprietary — see [wonda.sh](https://wonda.sh) for terms.
