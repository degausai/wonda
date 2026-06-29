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

| Tool                     | Description                                |
| ------------------------ | ------------------------------------------ |
| `generate_image`         | Generate an image from a text prompt       |
| `generate_video`         | Generate a video from a text prompt        |
| `generate_text`          | Generate text from a prompt                |
| `generate_music`         | Generate a music track                     |
| `speech`                 | Text-to-speech                             |
| `transcribe`             | Speech-to-text                             |
| `dialogue`               | Multi-speaker dialogue                     |
| `analyze_video`          | Extract frame grid + transcript from video |
| `edit_video`             | Video editing operations                   |
| `edit_image`             | Image editing operations                   |
| `edit_audio`             | Audio editing operations                   |
| `upload_media`           | Upload media from URL                      |
| `get_media`              | Get media metadata                         |
| `list_media`             | List media library                         |
| `get_inference_job`      | Poll generation job status                 |
| `get_editor_job`         | Poll editor job status                     |
| `get_publish_job`        | Poll publish job status                    |
| `publish_instagram`      | Publish to Instagram                       |
| `publish_tiktok`         | Publish to TikTok                          |
| `provision_twin`         | Provision or connect a cloud twin          |
| `list_twins`             | List provisioned cloud twins               |
| `show_twin`              | Get one cloud twin                         |
| `pause_twin`             | Pause a cloud twin                         |
| `resume_twin`            | Resume a cloud twin                        |
| `run_now_twin`           | Trigger an on-demand twin run              |
| `twin_can_act`           | Check whether a twin can act now           |
| `twin_action_allowance`  | Get per-action allowance and usage         |
| `twin_health`            | Get twin liveness and ban-signal health    |
| `twin_limits`            | Get twin action-cap limits                 |
| `set_twin_limits`        | Set twin action-cap limits                 |
| `list_twin_runs`         | List recent twin runs                      |
| `get_twin_output`        | Get a twin run output URL                  |
| `list_twin_schedules`    | List twin schedules                        |
| `create_twin_schedule`   | Create a twin schedule                     |
| `update_twin_schedule`   | Update a twin schedule                     |
| `delete_twin_schedule`   | Delete a twin schedule                     |
| `twin_seed_from_cookies` | Seed a twin profile from cookies           |
| `twin_login_automated`   | Start automated twin login                 |
| `twin_login_status`      | Check twin login status                    |
| `twin_needs_auth_view`   | Flag auth needed and mint a view URL       |
| `linkedin_*`             | LinkedIn twin platform actions             |
| `reddit_*`               | Reddit twin platform actions               |
| `x_*`                    | X twin platform actions                    |
| `instagram_*`            | Instagram twin platform actions            |

## Resources

| Resource     | URI                    | Description                    |
| ------------ | ---------------------- | ------------------------------ |
| Balance      | `wonda://balance`      | Credit balance and refill time |
| Capabilities | `wonda://capabilities` | All models and operations      |
| Twins        | `wonda://twins`        | Provisioned twins with status  |

## Environment Variables

| Variable         | Required | Description                                                        |
| ---------------- | -------- | ------------------------------------------------------------------ |
| `WONDA_API_KEY`  | Yes      | Your Wonda API key (`sk_...`)                                      |
| `WONDA_BASE_URL` | No       | Override API base URL (default: `https://api.wondercat.ai/api/v1`) |

## License

MIT
