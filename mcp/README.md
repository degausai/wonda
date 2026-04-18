# @degausai/wonda-mcp

MCP server for the [Wonda](https://wonda.sh) content creation API.

Generate images, videos, music, and audio. Edit and compose media. Publish to Instagram and TikTok. All from any MCP-compatible AI agent.

## Setup

### Claude Desktop / Cursor / Windsurf

Add to your MCP config:

```json
{
  "mcpServers": {
    "wonda": {
      "command": "npx",
      "args": ["-y", "@degausai/wonda-mcp"],
      "env": {
        "WONDA_API_KEY": "sk_your_api_key"
      }
    }
  }
}
```

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

## Tools

| Tool                | Description                                |
| ------------------- | ------------------------------------------ |
| `generate_image`    | Generate an image from a text prompt       |
| `generate_video`    | Generate a video from a text prompt        |
| `generate_text`     | Generate text from a prompt                |
| `generate_music`    | Generate a music track                     |
| `speech`            | Text-to-speech                             |
| `transcribe`        | Speech-to-text                             |
| `dialogue`          | Multi-speaker dialogue                     |
| `analyze_video`     | Extract frame grid + transcript from video |
| `edit_video`        | Video editing operations                   |
| `edit_image`        | Image editing operations                   |
| `edit_audio`        | Audio editing operations                   |
| `upload_media`      | Upload media from URL                      |
| `get_media`         | Get media metadata                         |
| `list_media`        | List media library                         |
| `get_inference_job` | Poll generation job status                 |
| `get_editor_job`    | Poll editor job status                     |
| `get_publish_job`   | Poll publish job status                    |
| `publish_instagram` | Publish to Instagram                       |
| `publish_tiktok`    | Publish to TikTok                          |

## Resources

| Resource     | URI                    | Description                    |
| ------------ | ---------------------- | ------------------------------ |
| Balance      | `wonda://balance`      | Credit balance and refill time |
| Capabilities | `wonda://capabilities` | All models and operations      |

## Environment Variables

| Variable         | Required | Description                                                        |
| ---------------- | -------- | ------------------------------------------------------------------ |
| `WONDA_API_KEY`  | Yes      | Your Wonda API key (`sk_...`)                                      |
| `WONDA_BASE_URL` | No       | Override API base URL (default: `https://api.wondercat.ai/api/v1`) |

## License

MIT
