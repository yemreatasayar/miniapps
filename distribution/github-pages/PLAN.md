# GitHub Pages Plan

## Current goal

Build a same-origin static web version inside `distribution/github-pages/site` without touching the existing desktop distribution folders.

## Phase 1

Status: completed

- Move shell and app builds to subpath-safe asset URLs
- Allow every app build to receive `base` and `outDir` from environment
- Produce a single static site tree:
  - `index.html`
  - `distribution-config.json`
  - `apps/<app-id>/`

## Phase 2

Status: in progress

- Verify which apps run correctly on plain static hosting
- Check header-sensitive apps:
  - `audio-editor`
  - `video-to-audio`
  - `bg-remover`
- Decide default visibility for limited apps such as `stem-splitter`

## Phase 3

Status: initial implementation completed

- Add PWA manifest and service worker
- Add offline-ready messaging
- Decide how `pdf compress/repair` should behave on the web version

## Current notes

- `distribution/github-pages/site` now includes:
  - `manifest.webmanifest`
  - `service-worker.js`
  - `offline.html`
- Manifest now includes a dedicated maskable icon entry for install surfaces.
- Launcher now shows online/offline readiness state and blocks first-time offline opens.
- `pdf-toolkit` still needs a product decision for `compress/repair` on the web version.
- `stem-splitter` is built but remains hidden by default because it still depends on helper/backend logic.
- Service worker app-entry caching now follows `visibleAppIds`, so hidden apps such as `stem-splitter` are no longer treated as offline-ready routes.
- `pdf-toolkit` web build now disables `compress/repair` explicitly instead of probing localhost.
- `bg-remover` now uses an explicit IMG.LY asset origin, with room to switch to self-hosted model assets later via env override.
- `bg-remover` UI now states that first use requires an online model download and that the model currently comes from IMG.LY.
- FFmpeg worker bundles are now post-processed during the GitHub Pages build so missing local FFmpeg assets fail explicitly instead of falling back to `unpkg`.
