# Native Runtime Binaries

This directory contains optional native runtime binaries bundled with the packaged app.

## Structure

```
resources/
  llama-server.exe       # llama.cpp inference server (Windows x64)
  whisper-cli.exe        # whisper.cpp transcription CLI (Windows x64)
  models/
    llama/               # GGUF model files for LlamaServerManager
    whisper/             # GGML model files for WhisperCliManager
```

## Notes

- Files placed here are copied into the packaged app under `resources/` by `electron-builder`.
- At runtime, access via `process.resourcesPath` (already implemented in `llama-server-manager.cjs` and `whisper-cli-manager.cjs`).
- These binaries are **not committed** due to size. Download separately or build from source:
  - llama.cpp: https://github.com/ggerganov/llama.cpp/releases
  - whisper.cpp: https://github.com/ggerganov/whisper.cpp/releases
- SHA-256 checksums for required model files are configured via `LLAMA_MODEL_SHA256` / `WHISPER_MODEL_SHA256` env vars or `ModelManager` defaults.
