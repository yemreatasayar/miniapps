# Stem Splitter Backend

## Security posture

- Python environment is isolated in `.venv`
- `demucs` is pinned to `4.0.1`
- runtime binary paths are loaded from `helper-config.json` or env overrides
- worker uses `spawn(..., { shell: false })`
- uploads are size-limited and extension/MIME validated
- temp job folders are auto-cleaned after TTL or download completion

## Runtime defaults

- Model: `htdemucs`
- Two stems mode: `vocals` / `no_vocals`
- Device: `cpu`
- Output format: `mp3` (`320 kbps`)
- Warm-up: controlled startup warm-up with an `ffmpeg`-generated 20 second tone

## Config source

- default config file: `backend/helper-config.json`
- custom config file: `node backend/server.mjs --config /path/to/helper-config.json`
- env override prefix: `MINIAPPS_STEM_HELPER_*`

### Supported env overrides

- `MINIAPPS_STEM_HELPER_CONFIG`
- `MINIAPPS_STEM_HELPER_BASE_DIR`
- `MINIAPPS_STEM_HELPER_HOST`
- `MINIAPPS_STEM_HELPER_PORT`
- `MINIAPPS_STEM_HELPER_TMP_DIR`
- `MINIAPPS_STEM_HELPER_PYTHON_BIN`
- `MINIAPPS_STEM_HELPER_FFMPEG_BIN`
- `MINIAPPS_STEM_HELPER_FFPROBE_BIN`
- `MINIAPPS_STEM_HELPER_ALLOWED_ORIGINS`
- `MINIAPPS_STEM_HELPER_EXTRA_ORIGINS`
- `MINIAPPS_STEM_HELPER_MODEL`
- `MINIAPPS_STEM_HELPER_VERSION`
- `MINIAPPS_STEM_HELPER_PLATFORM`

### Config notes

- `baseDir` relative path values icin referans klasordur
- `pythonBin`, `ffmpegBin`, `ffprobeBin` ve `tmpDir` `baseDir` baz alinarak resolve edilir
- `allowedOrigins` ile `extraOrigins` birlestirilip CORS allowlist olusturulur
- origin env degerleri virgul ile ayrilmis liste olarak verilebilir

### Packaged helper example

```json
{
  "baseDir": "..",
  "pythonBin": "./python/bin/python3",
  "ffmpegBin": "./ffmpeg/bin/ffmpeg",
  "ffprobeBin": "./ffmpeg/bin/ffprobe",
  "tmpDir": "./tmp"
}
```

## Installed versions

- Python: `3.9.6`
- ffmpeg: `8.1`
- demucs: `4.0.1`

## Model source

- Package source: official PyPI `demucs==4.0.1`
- Project home: `https://github.com/facebookresearch/demucs`
- Warm-up strategy: model is pulled during backend startup instead of the first user split
- Expected model cache: user cache under the active runtime account (Demucs/Torch default cache path)

## Notes to record after install

- model cache location
- first warm-up success timestamp
