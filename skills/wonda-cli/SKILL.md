---
name: wonda-cli
description: Using the Wonda CLI to generate images, videos, music, and audio from the terminal — plus LinkedIn, Reddit, and X/Twitter research and automation
---

# Wonda CLI

Wonda CLI is a content creation toolkit for terminal-based agents. Use it to generate images, videos, music, and audio; edit and compose media; publish to social platforms; and research/automate across LinkedIn, Reddit, and X/Twitter.

## Install

If `wonda` is not found on PATH, install it first:

```bash
# npm
npm i -g @degausai/wonda

# Homebrew
brew tap degausai/tap && brew install wonda
```

## Setup

- **Auth**: `wonda auth login` (opens browser, recommended) or set `WONDERCAT_API_KEY` env var
- **Verify**: `wonda auth check`

### Access tiers

Not all commands are available to every account type:

| Tier                                        | Access                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Anonymous** (temporary account, no login) | Media upload/download, editing (`video/edit`, `image/edit`, `audio/edit`), transcription, social publishing, scraping, analytics |
| **Free** (logged in, Basic/Free plan)       | Everything above + **generation** (`image/generate`, `video/generate`, etc.), styles, recipes, brand                             |
| **Paid** (Plus, Pro, or Absolute plan)      | Everything above + **video analysis** (requires credits), **skill commands** (`wonda skill install/list/get`)                    |

If a command returns a `403` error, check your plan at https://app.wondercat.ai/settings/billing.

### Global output flags

All commands support these output control flags:

- `--json` — Force JSON output (auto-enabled when stdout is piped)
- `--quiet` — Only output the primary identifier (job ID, media ID, etc.) — ideal for scripting
- `-o <path>` — Download output to file (implies `--wait`)
- `--fields status,outputs` — Select specific JSON fields
- `--jq '.outputs[0].media.url'` — Filter JSON output with a jq expression

## How to think about content creation

You are a marketing director with access to a full production toolkit. Before touching any tool, think:

1. **What product category?** (beauty, food, tech, fashion, fitness, etc.)
2. **What format performs for this category?** (UGC memes for everyday products, cinematic for luxury, before/after for transformations, testimonial for services)
3. **What's the hook?** (relatable scenario, surprising twist, aspirational lifestyle, social proof)
4. **What specific scene?** (not "product on table" but "person discovering the product in a funny situation")

## Decision flow

When asked to create content, follow this order:

### Step 1: Gather context

```bash
wonda brand                                                    # Brand identity, colors, products, audience
wonda analytics instagram                                      # What content performs well
wonda scrape social --handle @competitor --platform instagram --wait  # Competitive research (if relevant)

# Cross-platform research (if relevant)
wonda x search "topic OR keyword"                              # Find conversations on X/Twitter
wonda x user-tweets @competitor                                # Competitor's recent tweets
wonda reddit search "topic" --sort top --time week             # Reddit discussions
wonda reddit feed marketing --sort hot                         # Subreddit trends
wonda linkedin search "topic" --type COMPANIES                 # LinkedIn company/people research
wonda linkedin profile competitor-vanity-name                  # LinkedIn profile intel
```

### Step 2: Check content skills

Content skills are step-by-step guides for common content types. Each skill tells you exactly which models, prompts, and editing operations to use — and in what order. ALWAYS check skills before building from scratch.

```bash
wonda skill list                                # Browse all content skills
wonda skill get <slug>                          # Full step-by-step guide for a skill
```

**Full skill index:**

| Slug                      | Description                                                        | Input                     |
| ------------------------- | ------------------------------------------------------------------ | ------------------------- |
| product-video             | Product/scene video — prompt library for all categories            | optional product image    |
| ugc-talking               | Talking-head UGC — single clip, two-angle PIP, or 20s+ with B-roll | optional reference        |
| ugc-reaction-batch        | Batch TikTok-native UGC reactions with viral strategy              | optional product image    |
| tiktok-ugc-pipeline       | Scrape viral reel → generate 5 UGC → post as drafts                | reel or TikTok URL        |
| ugc-dance-motion          | Dance/motion transfer                                              | image + video             |
| marketing-brain           | Marketing strategy brain — hooks, visuals, ads                     | user brief                |
| reddit-subreddit-intel    | Scrape top posts, analyze virality, generate ideas                 | subreddit + product       |
| twitter-influencer-search | Find X influencers and amplifiers                                  | competitor/niche keywords |
| tiktok-slideshow-carousel | 3-slide TikTok carousel — hook, bridge, product reveal             | app screenshot + audience |

**If a skill matches** → `wonda skill get <slug>`, read it, adapt to context, execute each step.

**If no skill matches** → build from scratch (Step 3).

### Step 3: Build from scratch (chain endpoints)

When no skill matches, chain individual CLI commands. Each step produces an output that feeds into the next.

**Single asset:**

```bash
wonda generate image --model nano-banana-2 --prompt "..." --aspect-ratio 9:16 --wait -o out.png
# --negative-prompt "..." — override what to exclude (models like cookie have good defaults)
# --seed <number>         — pin the seed for reproducible results
wonda generate video --model seedance-2 --prompt "..." --duration 5 --params '{"quality":"high"}' --wait -o out.mp4
wonda generate text --model <model> --prompt "..." --wait
wonda generate music --model suno-music --prompt "upbeat lo-fi" --wait -o music.mp3
```

**Audio (speech, transcription, dialogue):**

```bash
# Text-to-speech
wonda audio speech --model elevenlabs-tts --prompt "Your script here" \
  --params '{"voiceId":"21m00Tcm4TlvDq8ikWAM"}' --wait -o speech.mp3
# elevenlabs-tts always requires a voiceId param
# Common voice: Rachel (female) "21m00Tcm4TlvDq8ikWAM"

# Transcribe audio/video to text
wonda audio transcribe --model elevenlabs-stt --attach $MEDIA --wait

# Multi-speaker dialogue
wonda audio dialogue --model elevenlabs-dialogue --prompt "Speaker A: Hi! Speaker B: Hello!" \
  --wait -o dialogue.mp3
```

**Add animated captions to a video:**

The `animatedCaptions` operation handles everything in one step — it extracts audio, transcribes for word-level timing, and renders animated word-by-word captions onto the video.

```bash
# Generate a video with speech audio
VID_JOB=$(wonda generate video --model seedance-2 --prompt "..." --duration 5 --aspect-ratio 9:16 --params '{"quality":"high"}' --wait --quiet)
VID_MEDIA=$(wonda jobs get inference $VID_JOB --jq '.outputs[0].media.mediaId')

# Add animated captions (single step)
wonda edit video --operation animatedCaptions --media $VID_MEDIA \
  --params '{"fontFamily":"TikTok Sans SemiCondensed","position":"bottom-center","sizePercent":80,"strokeWidth":2.5,"fontSizeScale":0.8,"highlightColor":"rgb(252, 61, 61)"}' \
  --wait -o final.mp4
```

The video's original audio is preserved. Do NOT replace the audio with TTS — Sora already generated the speech.

**Transitions (effects pipelines on a single video):**

```bash
wonda transitions presets                            # List built-in presets (JSON)
wonda transitions operations                         # Grouped by category (analysis/effect/...)
wonda transitions operations --json                  # Full per-param metadata
wonda transitions llms                               # Full reference (presets + ops + dependencies)
wonda transitions run --media $VID --preset flash_glow --wait -o out.mp4
# Or build a custom pipeline of steps:
wonda transitions run --media $VID \
  --steps '[{"glow":{"spread":8}},{"scene_flash":{}}]' --wait -o out.mp4
wonda transitions job <jobId>                        # Poll a transition job
```

Use `--preset` OR `--steps` (not both). Requires a full (logged-in) account. **Always read `wonda transitions llms` first when composing a custom pipeline** — it documents the detect→segment→effect dependencies and which ops need masks.

**Preset variables (`variables` block).** Each preset declares the template variables it accepts under `variables` in `wonda transitions presets`. Each entry has `name`, `description`, and `required`. Required variables MUST be supplied or the job is rejected with a 400 — no more silent skipping. Pass them with `--var name=value` (repeatable) or, for the common `prompt` case, the `--prompt` shortcut:

```bash
# flash_glow_prompted requires { prompt }
wonda transitions run --media $VID --preset flash_glow_prompted \
  --prompt "woman in white dress" --wait -o out.mp4

# text_behind_person requires { prompt, text }
wonda transitions run --media $VID --preset text_behind_person \
  --var prompt="the person" --var text="HELLO WORLD" --wait -o out.mp4
```

The `prompt` variable is a **detection text query** (Grounding DINO target describing which subject to mask), not a content-generation prompt. For presets that don't declare a `prompt` variable but still list `sam2`/`clip` in `models`, detection auto-picks the most recurring subject via CLIP — no variable needed.

Building a custom `--steps` pipeline that uses `detect` + `segment`? Add a `detect` step with `method: grounding_dino` and put the subject description in that step's `prompt` param (or use `method: clip` for auto-detect).

**Multi-scene presets (`requiresMultiScene: true`).** Some presets use `scene_split` and expect a video with multiple cuts/scenes. Check `requiresMultiScene` in `wonda transitions presets` — if true, feeding a single continuous shot will produce only one scene and the effect may look underwhelming. Combine clips first or use a video with natural cuts.

**Per-step overrides (`--overrides`).** Tweak individual params of a preset's steps without rewriting the whole pipeline. Shape is **nested**: `{stepName: {paramName: value}}`. Step and param names come from `wonda transitions operations --json`.

```bash
wonda transitions run --media $VID --preset flash_glow \
  --overrides '{"glow":{"spread":12},"zoom":{"end":2.5}}' --wait -o out.mp4
```

**Output URL paths differ by job type:**

- Inference jobs (generate, audio): `.outputs[0].media.url` and `.outputs[0].media.mediaId`
- Editor jobs (edit): `.outputs[0].url` and `.outputs[0].mediaId`

## Model waterfall

### Image

Default: `nano-banana-2`. Only use others when:

- User explicitly asks for a different model
- Need vector output → `runware-vectorize`
- Need background removal → `birefnet-bg-removal`
- Cheapest possible → `z-image`
- NanoBanana fails (rare) → `seedream-4-5`
- Need readable text in image → `nano-banana-pro`
- Photorealistic/creative imagery → `grok-imagine` or `grok-imagine-pro`
- Spicy content → `cookie` (SDXL-based, tag-based or natural language prompts) — **ONLY select when the user explicitly asks for spicy content. Never auto-select.**

**Cookie model (`cookie`):** SDXL with DMD acceleration and hires fix. **Restricted: only use when the user explicitly requests spicy content.** Accepts both danbooru-style tags (`1cat, portrait, soft lighting`) and natural language. Supports `--negative-prompt` (has sensible defaults; override only when needed) and `--seed` for reproducibility.

```bash
wonda generate image --model cookie --prompt "1cat, portrait, soft lighting" --wait -o out.png
wonda generate image --model cookie --prompt "a woman in a garden, golden hour" \
  --negative-prompt "ugly, blurry, watermark" --seed 42 --wait -o out.png
```

### Video

Default: `seedance-2` (duration 5/10/15s, default 5s, quality: high). Escalation:

- Quality complaint or different style → `sora2` or `sora2pro`
- Max single-clip duration is **15s** for Seedance 2, **20s** for Sora → for longer content, stitch multiple clips via merge
- Veo (`veo3_1`, `veo3_1-fast`) is available but NOT in the default waterfall. Only pick Veo when the user explicitly asks for Veo by name.

**Image-to-video routing (MANDATORY when attaching a reference image):**

- Person/face visible in the **reference image** → MUST use `kling_3_pro` (preserves identity better for faces)
- No person in reference image → use `seedance-2`
- **Text-to-video (no reference image):** Seedance 2 generates people fine. This rule ONLY applies when you `--attach` an image.

**Kling model family:**

- `kling_3_pro` — Text-to-video and image-to-video, supports start/end images, custom elements (@Element1, @Element2), 3-15s duration, 16:9/9:16/1:1
- `kling_2_6_pro` — General purpose, 5-10s, 16:9/9:16/1:1, text-to-video and image-to-video
- `kling_2_6_motion_control` — Motion transfer: requires both a reference image AND a reference video, recreates the video's motion with the image's appearance
- `kling2_5-pro` — Budget Kling option, 5-10s, supports first/last frame images

**Other video models:**

- `grok-imagine-video` — xAI video generation, 5-15s, supports 7 aspect ratios including 4:3 and 3:2
- `topaz-video-upscale` — Upscale video resolution (1-4x factor, supports fps conversion)
- `sync-lipsync-v2-pro` — Legacy lipsync for user-supplied video + audio pairs. Inferior to native-audio generation and almost never the right choice for new content. See the "Lip sync" section for rules.

Seedance family (DEFAULT video model, watermarks automatically removed):

- `seedance-2` — Base Seedance 2.0 (T2V/I2V, 5-15s, high=standard/basic=fast)
- `seedance-2-omni` — Multi-reference generation (images, audio refs)
- `seedance-2-video-edit` — Edit existing video via text prompt

**Video durations:** Accepted `--duration` values vary by model. Check with `wonda capabilities` or `wonda models info <slug>`.

### Audio

- Music: `suno-music` (set `--params '{"instrumental":true}'` for no vocals)
- Text-to-speech: `elevenlabs-tts` — only for explicit narrator/voice-over asks over silent footage. Do NOT use to "make a UGC character talk" — Sora / Sora 2 Pro / Veo 3.1 / Kling 3 / Seedance 2 generate native synced speech in any language, which looks and sounds far better. Always set voiceId in params. Default female voice: `--params '{"voiceId":"21m00Tcm4TlvDq8ikWAM"}'` (Rachel).
- Transcription: `elevenlabs-stt`
- Multi-speaker dialogue: `elevenlabs-dialogue`

**Native synced speech (preferred over TTS + lipsync):** Sora, Sora 2 Pro, Veo 3.1, Kling 3, and Seedance 2 all generate dialogue in any language directly inside the video, with mouth movements baked in. Put the line (and language) in the video model's `--prompt`. Never chain `elevenlabs-tts` → `sync-lipsync-v2-pro` to fake speech over a silent generation.

## Prompt writing rules

Follow this waterfall top-to-bottom. Use the FIRST matching rule and stop.

1. **PASSTHROUGH** — If the user says "use my exact prompt" / "verbatim" / "no enhancements" → copy their words exactly. Zero modifications.

2. **IMAGE-TO-VIDEO** — When a source image feeds into a video model, describe MOTION ONLY. The model can see the image. Do NOT describe the image content.
   - Good: `"gentle breathing motion, camera slowly pushes in, atmospheric lighting shifts"`
   - Bad: `"Two cats on a lavender background breathing softly"` (describes the image)

3. **EMPTY PROMPT (from scratch)** — Use the user's exact request as the prompt. Do NOT add style descriptors, lighting, composition, or mood.
   - User says "create an image of a cat with sunglasses" → prompt: `"create an image of a cat with sunglasses"`
   - Do NOT enhance to `"A playful orange tabby wearing oversized reflective sunglasses, studio lighting, shallow depth of field"`

4. **NON-EMPTY PROMPT (adapting a template)** — Keep the structure and style, only swap content to match the user's request. Keep prompts literal and constraint-heavy.

## Aspect ratio rules

Three cases, no exceptions:

1. User specifies a ratio → use it: `--aspect-ratio 16:9`
2. User doesn't mention ratio → explicitly set `--aspect-ratio 9:16` for social content (UGC, TikTok, Reels, Stories). Portrait is the default for any social/marketing video.
3. Editing existing media → use `--aspect-ratio auto` to preserve source dimensions

**UGC and social content is ALWAYS portrait (9:16).** If someone asks for a TikTok, Reel, Story, or UGC video, always use `--aspect-ratio 9:16`. Landscape is only for YouTube, presentations, or when explicitly requested.

**Square (1:1)** is supported by all Kling models and some image models — use for Instagram feed posts when requested.

## Common chaining patterns

These patterns show how to compose multi-step pipelines by chaining CLI commands. Each step's output feeds into the next.

> **No need to download and re-upload between steps.** Every generation and edit
> produces a media ID in its output. Pass that ID directly to the next command
> via `--media` or `--audio-media`. Use `--jq '.outputs[0].media.mediaId'`
> for inference jobs and `--jq '.outputs[0].mediaId'` for editor jobs.
> Only use `-o <file>` on the FINAL step to download the finished output.

### Animate an image to video

```bash
MEDIA=$(wonda media upload ./product.jpg --quiet)
# No person in image → Seedance 2
wonda generate video --model seedance-2 --prompt "camera slowly pushes in, product rotates" \
  --attach $MEDIA --duration 5 --params '{"quality":"high"}' --wait -o animated.mp4
# Person in image → Kling (ONLY when attaching a reference image with a person)
wonda generate video --model kling_3_pro --prompt "the person turns and smiles" \
  --attach $MEDIA --duration 5 --wait -o person.mp4
```

### Replace audio on a video (TTS voiceover or music)

```bash
# Generate TTS
TTS_JOB=$(wonda audio speech --model elevenlabs-tts --prompt "The script" \
  --params '{"voiceId":"21m00Tcm4TlvDq8ikWAM"}' --wait --quiet)
TTS_MEDIA=$(wonda jobs get inference $TTS_JOB --jq '.outputs[0].media.mediaId')
# Mix onto video (mute original, full voiceover)
wonda edit video --operation editAudio --media $VID_MEDIA --audio-media $TTS_MEDIA \
  --params '{"videoVolume":0,"audioVolume":100}' --wait -o with-voice.mp4
```

Only use this when you need to REPLACE the video's audio. Sora, Sora 2 Pro, Veo 3.1, Kling 3, and Seedance 2 all generate native synced speech in any language — don't replace it with TTS unless the user explicitly asks for a different voiceover. Never reach for this step to "add speech" to a UGC/talking-head clip; put the dialogue in the video model's prompt instead.

### Add static text overlay

Static overlays (meme text, "chat did i cook", etc.) use smaller font sizes than captions. They're ambient, not meant to dominate the frame.

```bash
wonda edit video --operation textOverlay --media $VID_MEDIA \
  --prompt-text "chat, did i cook" \
  --params '{"fontFamily":"TikTok Sans SemiCondensed","position":"top-center","sizePercent":66,"fontSizeScale":0.5,"strokeWidth":4.5,"paddingTop":10}' \
  --wait -o with-text.mp4
```

**Font sizing guide:**

- Static overlays: `sizePercent: 66`, `fontSizeScale: 0.5`, `strokeWidth: 4.5`
- Animated captions: `sizePercent: 80`, `fontSizeScale: 0.8`, `strokeWidth: 2.5`, `highlightColor: rgb(252, 61, 61)`
- Font: `TikTok Sans SemiCondensed` for both

### Add animated captions (word-by-word with timing)

The `animatedCaptions` operation extracts audio, transcribes, and renders animated word-by-word captions — all in one step.

```bash
wonda edit video --operation animatedCaptions --media $VIDEO_MEDIA \
  --params '{"fontFamily":"TikTok Sans SemiCondensed","position":"bottom-center","sizePercent":80,"strokeWidth":2.5,"fontSizeScale":0.8,"highlightColor":"rgb(252, 61, 61)"}' \
  --wait -o with-captions.mp4
```

For quick static captions (no timing, just text on screen), use `textOverlay` with `--prompt-text`:

```bash
wonda edit video --operation textOverlay --media $VIDEO_MEDIA \
  --prompt-text "Summer Sale - 50% Off" \
  --params '{"fontFamily":"TikTok Sans SemiCondensed","position":"bottom-center","sizePercent":80}' \
  --wait -o captioned.mp4
```

### Add background music

```bash
MUSIC_JOB=$(wonda generate music --model suno-music \
  --prompt "upbeat lo-fi hip hop, warm vinyl crackle" --wait --quiet)
MUSIC_MEDIA=$(wonda jobs get inference $MUSIC_JOB --jq '.outputs[0].media.mediaId')
wonda edit video --operation editAudio --media $VID_MEDIA --audio-media $MUSIC_MEDIA \
  --params '{"videoVolume":100,"audioVolume":30}' --wait -o with-music.mp4
```

### Editor output chaining

When chaining multiple editor operations (e.g., editAudio → animatedCaptions → textOverlay), extract the media ID from each editor job output and pass it to the next step. Note the jq path differs from inference jobs:

```bash
# Inference jobs: .outputs[0].media.mediaId
# Editor jobs:    .outputs[0].mediaId

EDIT_JOB=$(wonda edit video --operation editAudio --media $VID --audio-media $AUDIO \
  --params '{"videoVolume":0,"audioVolume":100}' --wait --quiet)
STEP1_MEDIA=$(wonda jobs get editor $EDIT_JOB --jq '.outputs[0].mediaId')

CAP_JOB=$(wonda edit video --operation animatedCaptions --media $STEP1_MEDIA \
  --params '{"fontFamily":"TikTok Sans SemiCondensed","position":"bottom-center","sizePercent":80,"strokeWidth":2.5,"fontSizeScale":0.8,"highlightColor":"rgb(252, 61, 61)"}' --wait --quiet)
STEP2_MEDIA=$(wonda jobs get editor $CAP_JOB --jq '.outputs[0].mediaId')

wonda edit video --operation textOverlay --media $STEP2_MEDIA \
  --prompt-text "Hook text" --params '{"position":"top-center","fontFamily":"TikTok Sans SemiCondensed","sizePercent":66,"fontSizeScale":0.5,"strokeWidth":4.5}' --wait -o final.mp4
```

### Merge multiple clips

```bash
wonda edit video --operation merge --media $CLIP1,$CLIP2,$CLIP3 --wait -o merged.mp4
```

Media order = playback order. Up to 5 clips.

### Split scenes / keep a specific scene

Two modes — pick by intent:

```bash
# Keep a specific scene (split mode) — splits into scenes, auto-selects one
wonda edit video --operation splitScenes --media $VID_MEDIA \
  --params '{"mode":"split","threshold":0.5,"minClipDuration":2,"outputSelection":"last"}' \
  --wait -o last-scene.mp4
# outputSelection: "first", "last", or 1-indexed number (e.g. 2 for second scene)

# Remove a scene (omit mode) — removes one scene, merges the rest
wonda edit video --operation splitScenes --media $VID_MEDIA \
  --params '{"mode":"omit","threshold":0.5,"minClipDuration":2,"outputSelection":"first"}' \
  --wait -o without-first.mp4
# outputSelection: which scene to REMOVE
```

Use omit mode for "remove frozen first frame" (common with Sora videos). Use split mode for "keep just scene X".

### Image editing (img2img)

```bash
MEDIA=$(wonda media upload ./photo.jpg --quiet)
wonda generate image --model nano-banana-2 --prompt "change the background to blue" \
  --attach $MEDIA --aspect-ratio auto --wait -o edited.png
```

When editing an existing image, always use `--aspect-ratio auto` to preserve dimensions. The prompt should describe ONLY the edit, not the full image.

### Background removal

```bash
# Image → use birefnet-bg-removal
wonda generate image --model birefnet-bg-removal --attach $IMAGE_MEDIA --wait -o no-bg.png
# Video → use bria-video-background-removal
wonda generate video --model bria-video-background-removal --attach $VIDEO_MEDIA --wait -o no-bg.mp4
```

CRITICAL: Image and video background removal are different models. Never swap them.

### Lip sync (last-resort fallback — prefer native-audio video models)

Sora, Sora 2 Pro, Veo 3.1, Kling 3, and Seedance 2 all generate speech in any language with correctly synced mouth movements as part of the video itself. That path produces dramatically better results than `sync-lipsync-v2-pro`: better lip physics, better lighting, better costs, and no second inference round-trip. For any talking UGC, ad, or spokesperson video, put the dialogue directly in the video model's prompt — do not chain TTS + lipsync.

Only reach for `sync-lipsync-v2-pro` when the user EXPLICITLY supplies both a pre-existing video and a pre-existing audio clip and asks you to align the mouth to that audio. If a user asks for lipsync as the default method of making a character speak, push back: the native-audio video models are the better tool and work in any language.

```bash
wonda generate video --model sync-lipsync-v2-pro --attach $VIDEO_MEDIA,$AUDIO_MEDIA --wait -o synced.mp4
```

### Video upscale

```bash
wonda generate video --model topaz-video-upscale --attach $VIDEO_MEDIA \
  --params '{"upscaleFactor":2}' --wait -o upscaled.mp4
```

## Editor operations reference

| Operation          | Inputs                      | Key Params                                                                    |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------- |
| `animatedCaptions` | video_0                     | fontFamily, position, sizePercent, fontSizeScale, strokeWidth, highlightColor |
| `textOverlay`      | video_0 + prompt            | fontFamily, position, sizePercent, fontSizeScale, strokeWidth                 |
| `editAudio`        | video_0 + audio_0           | videoVolume (0-100), audioVolume (0-100)                                      |
| `merge`            | video_0..video_4            | Handle order = playback order                                                 |
| `overlay`          | video_0 (bg) + video_1 (fg) | position, resizePercent                                                       |
| `splitScreen`      | video_0 + video_1           | targetAspectRatio (16:9 or 9:16)                                              |
| `trim`             | video_0                     | trimStartMs, trimEndMs (milliseconds)                                         |
| `splitScenes`      | video_0                     | mode (split/omit), threshold, outputSelection                                 |
| `speed`            | video_0                     | speed (multiplier: 2 = 2x faster)                                             |
| `extractAudio`     | video_0                     | Extracts audio track                                                          |
| `reverseVideo`     | video_0                     | Plays backwards                                                               |
| `skipSilence`      | video_0                     | maxSilenceDuration (default 0.03)                                             |
| `imageCrop`        | video_0                     | aspectRatio                                                                   |
| `textOverlay`      | video_0 (image)             | Same as video textOverlay — works on images, outputs image (png/jpg)          |

Valid textOverlay fonts: Inter, Montserrat, Bebas Neue, Oswald, TikTok Sans, TikTok Sans Condensed, TikTok Sans SemiCondensed, TikTok Sans SemiExpanded, TikTok Sans Expanded, TikTok Sans ExtraExpanded, Nohemi, Poppins, Raleway, Anton, Comic Cat, Gavency
Valid positions: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right

## Marketing & distribution

```bash
# Connected social accounts
wonda accounts instagram
wonda accounts tiktok

# Analytics
wonda analytics instagram
wonda analytics tiktok
wonda analytics meta-ads

# Scrape competitors
wonda scrape social --handle @nike --platform instagram --wait
wonda scrape social-status <taskId>                   # Get results of a social scrape
wonda scrape ads --query "sneakers" --country US --wait
wonda scrape ads --query "sneakers" --country US --search-type keyword \
  --active-status active --sort-by impressions_desc --period last30d \
  --media-type video --max-results 50 --wait
wonda scrape ads-status <taskId>                      # Get results of an ads search

# Download a single reel or TikTok video
SCRAPE=$(wonda scrape video --url "https://www.instagram.com/reel/ABC123/" --wait --quiet)
# → returns scrape result with mediaId in the media array

# Publish
wonda publish instagram --media <id> --account <accountId> --caption "New drop"
wonda publish instagram --media <id> --account <accountId> --caption "..." --alt-text "..." --product IMAGE --share-to-feed
wonda publish instagram-carousel --media <id1>,<id2>,<id3> --account <accountId> --caption "..."
wonda publish tiktok --media <id> --account <accountId> --caption "New drop"
wonda publish tiktok --media <id> --account <accountId> --caption "..." --privacy-level PUBLIC_TO_EVERYONE --aigc
wonda publish tiktok-carousel --media <id1>,<id2> --account <accountId> --caption "..." --cover-index 0

# History
wonda publish history instagram --limit 10
wonda publish history tiktok --limit 10

# Browse media library
wonda media list --kind image --limit 20
wonda media info <mediaId>
```

### X/Twitter

Supports reads, writes, and social graph.

```bash
# Auth setup (run `wonda x auth --help` for details)
wonda x auth set
wonda x auth check

# Read
wonda x search "sneakers" -n 20                     # Search tweets
wonda x user @nike                                   # User profile
wonda x user-tweets @nike -n 20                      # User's recent tweets
wonda x read <tweet-id-or-url>                       # Single tweet
wonda x replies <tweet-id-or-url>                    # Replies to a tweet
wonda x thread <tweet-id-or-url>                     # Full thread (author's self-replies)
wonda x home                                         # Home timeline (--following for Following tab)
wonda x bookmarks                                    # Your bookmarks
wonda x likes                                        # Your liked tweets
wonda x following @handle                            # Who a user follows
wonda x followers @handle                            # A user's followers
wonda x lists @handle                                # User's lists (--member-of for memberships)
wonda x list-timeline <list-id-or-url>               # Tweets from a list
wonda x news --tab trending                          # Trending topics (tabs: for_you, trending, news, sports, entertainment)

# Write (uses internal API — use on secondary accounts)
wonda x tweet "Hello world"                          # Post a tweet
wonda x reply <tweet-id-or-url> "Great point"        # Reply
wonda x like <tweet-id-or-url>                       # Like
wonda x unlike <tweet-id-or-url>                     # Unlike
wonda x retweet <tweet-id-or-url>                    # Retweet
wonda x unretweet <tweet-id-or-url>                  # Unretweet
wonda x follow @handle                               # Follow
wonda x unfollow @handle                             # Unfollow

# Maintenance
wonda x refresh-ids                                  # Refresh cached GraphQL query IDs from X's JS bundles
```

All paginated commands support: `-n <count>`, `--cursor`, `--all`, `--max-pages`, `--delay <ms>`.

### LinkedIn

Supports search, profiles, companies, messaging, and engagement.

```bash
# Auth setup (run `wonda linkedin auth --help` for details)
wonda linkedin auth set
wonda linkedin auth check

# Read
wonda linkedin me                                    # Your identity
wonda linkedin search "data engineer" --type PEOPLE  # Search (types: PEOPLE, COMPANIES, ALL)
wonda linkedin profile johndoe                       # View profile (vanity name or URL)
wonda linkedin company google                        # View company page
wonda linkedin conversations                         # List message threads
wonda linkedin messages <conversation-urn>           # Read messages in a thread
wonda linkedin notifications -n 20                   # Recent notifications
wonda linkedin connections                           # Your connections
wonda linkedin reactions <activity-id>               # Reactions with reactor profiles + type

# Write
wonda linkedin connect <vanity-name> --message "Hey!" # Send connection request with note
wonda linkedin connect <vanity-name> -m "Hey!" --browser  # Full stealth via real browser (Patchright)
wonda linkedin like <activity-urn>                   # Like a post
wonda linkedin unlike <activity-urn>                 # Remove a like
wonda linkedin send-message <conversation-urn> "Hi!" # Send a message
wonda linkedin post "Excited to announce..."         # Create a post
wonda linkedin delete-post <activity-id>             # Delete a post
```

Paginated commands support: `-n <count>`, `--start`, `--all`, `--max-pages`, `--delay <ms>`.

**Connection request modes:** The `connect` command has two modes:

- **Default (API):** Voyager REST API with fingerprint mitigations (profile visit → drawer warm-up → connect). Fast (~3s), supports notes via `customMessage`.
- **`--browser` (Patchright):** Launches a real undetected Chrome browser, navigates to the profile, and clicks through the UI. Zero fingerprinting risk. Slower (~10s) but fully safe. Use this as a fallback if you want full protection. Requires: `npm i patchright && npx patchright install chromium`.

### Reddit

Auth is optional — many reads work unauthenticated. Supports search, feeds, users, posts, trending, and chat/DMs.

```bash
# Auth setup (run `wonda reddit auth --help` for details)
wonda reddit auth set
wonda reddit auth check

# Read (works without auth)
wonda reddit search "AI video" --sort top --time week   # Search posts (sort: relevance, hot, top, new, comments)
wonda reddit subreddit marketing                        # Subreddit info
wonda reddit feed marketing --sort hot                  # Subreddit posts (sort: hot, new, top, rising)
wonda reddit user spez                                  # User profile
wonda reddit user-posts spez --sort top                 # User's posts
wonda reddit user-comments spez                         # User's comments
wonda reddit post <id-or-url> -n 50                     # Post with comments
wonda reddit trending --sort hot                        # Popular/trending posts

# Read (requires auth)
wonda reddit home --sort best                           # Your home feed

# Write (requires auth)
wonda reddit submit marketing --title "Great tool" --text "Check this out..."  # Self post
wonda reddit submit marketing --title "Great tool" --url "https://..."         # Link post
wonda reddit comment <parent-fullname> --text "Nice post!"                     # Reply
wonda reddit vote <fullname> --up                       # Upvote (--down, --unvote)
wonda reddit subscribe marketing                        # Subscribe (--unsub to unsubscribe)
wonda reddit save <fullname>                            # Save a post or comment
wonda reddit unsave <fullname>                          # Unsave
wonda reddit delete <fullname>                          # Delete your post or comment
```

Paginated commands support: `-n <count>`, `--after <cursor>`, `--all`, `--max-pages`, `--delay <ms>`.

### Reddit chat / DMs

Direct messaging via the Matrix protocol. Requires a separate chat token.

```bash
# Auth setup (run `wonda reddit chat auth-set --help` for details)
wonda reddit chat auth-set

# Read
wonda reddit chat inbox                                  # List DM conversations with latest messages
wonda reddit chat messages <room-id> -n 50               # Fetch messages from a room
wonda reddit chat all-rooms                              # List ALL joined rooms (not limited to sync window)

# Write
wonda reddit chat send <room-id> --text "Hey!"           # Send a DM (mimics browser typing behavior)

# Management
wonda reddit chat accept-all                             # Accept all pending chat requests
wonda reddit chat refresh                                # Force-refresh the Matrix chat token
```

**Important**: The chat token expires every ~24h. The CLI auto-refreshes on use, but if it expires fully, re-run `auth-set`. Rate limit DM sends to 15-20/day with varied text to avoid detection. The `send` command includes a typing delay (1-5s) to mimic human behavior.

## Workflow & discovery

### Video analysis

Analyze a video to extract a composite frame grid (visual) and audio transcript (text). Useful for understanding video content before creating variations. Requires a **full account** (not anonymous) and costs credits based on video duration (ElevenLabs STT pricing).

If the video was just uploaded and is still normalizing, the CLI auto-retries until the media is ready.

```bash
# Analyze a video — returns composite grid image + transcript
ANALYSIS_JOB=$(wonda analyze video --media $VIDEO_MEDIA --wait --quiet)

# The job output contains:
# - compositeGrid: image showing 24 evenly-spaced frames
# - transcript: full text of any speech
# - wordTimestamps: word-level timing [{word, start, end}]
# - videoMetadata: {width, height, durationMs, fps, aspectRatio}

# Download the composite grid for visual inspection
wonda analyze video --media $VIDEO_MEDIA --wait -o /tmp/grid.jpg

# Get just the transcript
wonda analyze video --media $VIDEO_MEDIA --wait --jq '.outputs[] | select(.outputKey=="transcript") | .outputValue'
```

**Error handling**: 402 = insufficient credits, 409 = media still processing (CLI auto-retries).

### Chat (AI assistant)

Interactive chat sessions for content creation — the AI handles generation, editing, and iteration.

```bash
wonda chat create --title "Product launch"            # New session
wonda chat list                                       # List sessions (--limit, --offset)
wonda chat messages <chatId>                          # Get messages
wonda chat send <chatId> --message "Create a UGC reaction video"
wonda chat send <chatId> --message "Edit it" --media <id>
wonda chat send <chatId> --message "..." --aspect-ratio 9:16 --quality-tier max
wonda chat send <chatId> --message "..." --style <styleId>
wonda chat send <chatId> --message "..." --passthrough-prompt  # Use exact prompt, no AI enhancement
```

### Jobs & runs

```bash
wonda jobs get inference <id>                         # Inference job status
wonda jobs get editor <id>                            # Editor job status
wonda jobs get publish <id>                           # Publish job status
wonda jobs wait inference <id> --timeout 20m          # Wait for completion
wonda run get <runId>                                 # Run status
wonda run wait <runId> --timeout 30m                  # Wait for run completion
```

### Discovery

```bash
wonda models list                                     # All available models
wonda models info <slug>                              # Model details and params
wonda operations list                                 # All editor operations
wonda operations info <operation>                     # Operation details
wonda capabilities                                    # Full platform capabilities
wonda pricing list                                    # Pricing for all models
wonda pricing estimate --model seedance-2 --prompt "..." # Cost estimate
wonda style list                                      # Available visual styles
wonda topup                                            # Top up credits (opens Stripe checkout)
```

### Editing audio & images

```bash
# Edit audio
wonda edit audio --operation <op> --media <id> --wait -o out.mp3

# Edit image (crop, text overlay)
wonda edit image --operation imageCrop --media <id> \
  --params '{"aspectRatio":"9:16"}' --wait -o cropped.png

# Add text to an image (outputs image, same format as input)
wonda edit image --operation textOverlay --media <id> \
  --prompt-text "Your text here" \
  --params '{"fontFamily":"TikTok Sans","position":"bottom-center","fontSizeScale":1.5,"textColor":"#FFFFFF","strokeWidth":2}' \
  --wait -o output.png
```

### Alignment (timestamp extraction)

```bash
wonda alignment extract-timestamps --model <model> --attach <mediaId> --wait
```

## Quality tiers

| Tier     | Image Model       | Resolution | Video Model              | When                                                                                           |
| -------- | ----------------- | ---------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Standard | `nano-banana-2`   | 1K         | `seedance-2` (high, 5s)  | Default. High quality, good for iteration.                                                     |
| High     | `nano-banana-pro` | 1K         | `seedance-2` (high, 15s) | Longer duration. Also offer `sora2pro` for different style.                                    |
| Max      | `nano-banana-pro` | 4K         | `seedance-2` (high, 15s) | Best possible. Also offer `sora2pro` (1080p). Use `--params '{"resolution":"4K"}'` for images. |

## Troubleshooting

| Symptom                          | Likely Cause                                  | Fix                                                    |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Sora rejected image              | Person in image                               | Switch to `kling_3_pro`                                |
| Video adds objects not in source | Motion prompt describes elements not in image | Simplify to camera movement and atmosphere only        |
| Text unreadable in video         | AI tried to render text in generation         | Remove text from video prompt, use textOverlay instead |
| Hands look wrong                 | Complex hand actions in prompt                | Simplify to passive positions or frame to exclude      |
| Style inconsistent across series | No shared anchor                              | Use same reference image via `--attach`                |
| Changes to step A not in step B  | Stale render                                  | Re-run all downstream steps                            |

## Timing expectations

- Image: 30s - 2min
- Video (Sora): 2 - 5min
- Video (Sora Pro): 5 - 10min
- Video (Veo 3.1): 1 - 3min
- Video (Kling): 3 - 8min
- Video (Grok): 2 - 5min
- Music (Suno): 1 - 3min
- TTS: 10 - 30s
- Editor operations: 30s - 2min
- Lip sync: 1 - 3min
- Video upscale: 2 - 5min

## Error recovery

- **Unknown model**: `wonda models list`
- **No API key**: `wonda auth login` or set `WONDERCAT_API_KEY` env var
- **Job failed**: `wonda jobs get inference <id>` for error details
- **Bad params**: `wonda models info <slug>` for valid params
- **Timeout**: `wonda jobs wait inference <id> --timeout 20m`
- **Insufficient credits (402)**: `wonda topup` to add credits
