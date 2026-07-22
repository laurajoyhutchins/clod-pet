# Configure an AI provider without storing its API key

Clod Pet stores only non-secret provider preferences in `clod-pet-settings.json`:

```json
{
  "LLM": {
    "provider": "openai",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o"
  }
}
```

API keys, bearer tokens, and authorization headers are not accepted by `set_settings` and are never returned by `get_settings`. Hosted-provider credentials are read from the backend process environment when a client is created.

## Supported credential variables

| Provider | Environment variable |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY`, with `GOOGLE_API_KEY` as a compatibility fallback |
| Ollama | None for the default local configuration |

Set the applicable variable in the environment that launches Clod Pet. Prefer a password manager, service manager, or a terminal session that does not save the value to shell history. Do not place credentials in the repository, the settings JSON, launcher scripts, command-line arguments, or diagnostic reports.

The environment variable must be present when the Go backend starts. Restart Clod Pet after changing it.

## Change provider preferences

Use the settings file or the `set_settings` command for non-secret values only:

```json
{
  "command": "set_settings",
  "payload": {
    "LLM": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    }
  }
}
```

A patch containing fields such as `api_key`, `token`, or `authorization` is rejected before any settings are written.

## Legacy plaintext migration

Older settings files may contain an `LLM.api_key` or another credential-shaped field. On the first successful load, Clod Pet:

1. reads the non-secret provider, base URL, and model preferences;
2. removes credential-shaped fields from the in-memory configuration;
3. rewrites the settings file without the credential while preserving unrelated settings; and
4. does not include the removed value in logs or errors.

The settings file must be writable for migration. If the safe rewrite fails, loading fails closed rather than continuing with the plaintext credential. Configure the equivalent environment variable before starting the application again.
