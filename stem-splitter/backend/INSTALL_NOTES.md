# Stem Splitter Backend

## Security posture

- Python environment is isolated in `.venv`
- `demucs` is pinned to `4.0.1`
- `ffmpeg` is expected from Homebrew
- worker uses `spawn(..., { shell: false })`
- uploads are size-limited and extension/MIME validated
- temp job folders are auto-cleaned after TTL or download completion

## Runtime defaults

- Model: `htdemucs`
- Two stems mode: `vocals` / `no_vocals`
- Device: `cpu`
- Output format: `mp3` (`320 kbps`)
- Warm-up: controlled startup warm-up with an `ffmpeg`-generated 20 second tone

## Installed versions

- Python: `3.9.6`
- ffmpeg: `8.1` (Homebrew)
- demucs: `4.0.1`

## Model source

- Package source: official PyPI `demucs==4.0.1`
- Project home: `https://github.com/facebookresearch/demucs`
- Warm-up strategy: model is pulled during backend startup instead of the first user split
- Expected model cache: user cache under the active runtime account (Demucs/Torch default cache path)

## Notes to record after install

- model cache location
- first warm-up success timestamp
