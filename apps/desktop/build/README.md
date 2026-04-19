# Build Resources

This directory contains static assets used by `electron-builder` during packaging.

## Required files (not committed — generate before release)

| File | Description |
|------|-------------|
| `icon.ico` | Windows application icon (256×256 minimum, ICO format) |
| `icon.icns` | macOS application icon (ICNS format, future use) |
| `icon.png` | Linux application icon (512×512 PNG, future use) |

## Generating `icon.ico`

Use any of the following tools:

- **ImageMagick** (CLI): `magick convert -resize 256x256 source.png icon.ico`
- **Inkscape**: Export > PNG, then convert with ImageMagick
- **Online**: https://convertio.co/png-ico/

Place the generated `icon.ico` file in this directory before running `pnpm dist:win`.

## Code signing (Windows)

Signing is configured via environment variables — **never commit certificates**.

| Variable | Description |
|----------|-------------|
| `WIN_CSC_LINK` | Absolute path to `.p12`/`.pfx` certificate file |
| `WIN_CSC_KEY_PASSWORD` | Password for the certificate |

If these variables are **not set**, `electron-builder` will produce an unsigned installer.
Unsigned installers display a SmartScreen warning on first run — acceptable for internal/beta use.

### CI/CD example (GitHub Actions)

```yaml
env:
  WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}          # base64-encoded .p12
  WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

Set `WIN_CSC_LINK` to the base64-encoded content of the `.p12` file:
```bash
base64 -i certificate.p12 | tr -d '\n'
```

## Native runtime binaries

Place optional native binaries in `../resources/`:

| File | Description |
|------|-------------|
| `resources/llama-server.exe` | llama.cpp inference server (Windows x64) |
| `resources/whisper-cli.exe` | whisper.cpp CLI transcription (Windows x64) |
| `resources/models/` | GGUF model files (resolved by ModelManager) |

These are copied into the packaged app under `resources/` and accessed via `process.resourcesPath`.
