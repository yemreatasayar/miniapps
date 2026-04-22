# GitHub Pages Smoke Test

Date: 2026-04-22

## Scope

- Static same-origin output in `distribution/github-pages/site`
- Preview server in `distribution/github-pages/preview-site.mjs`
- Launcher shell, sample app routes, manifest, service worker, and heavy runtime assets

## Confirmed working

- Shell route returns `200 OK`
- Sample app routes return `200 OK`
- `manifest.webmanifest` returns `200 OK`
- `service-worker.js` returns `200 OK`
- `offline.html` returns `200 OK`
- Audio editor FFmpeg core asset returns `200 OK`
- Video to Audio FFmpeg wasm asset returns `200 OK`
- PDF worker asset returns `200 OK`
- BG Remover ONNX wasm asset returns `200 OK`

## Browser-verified checks

- A real headless Chrome session was launched against `http://127.0.0.1:4179/`
- Shell loaded successfully with manifest present
- Service worker took control after shell load
- `csv-toolkit` loaded successfully while online
- `csv-toolkit` reloaded successfully after switching Chrome to offline mode
- Shell reloaded successfully while offline after prior online visit
- A browser screenshot was captured from the live session:
  - `/tmp/miniapps-shell-cdp.png`

## Confirmed packaging results

- Shell output is rooted at `site/index.html`
- All miniapps are emitted under `site/apps/<app-id>/`
- Launcher now shows:
  - online/offline state
  - first-open-required badge
  - offline-ready badge
- PWA files are generated:
  - `manifest.webmanifest`
  - `service-worker.js`
  - `offline.html`
- Manifest now exposes both a regular icon and a dedicated maskable icon.
- Service worker app-entry caching now only includes visible apps.

## Real limitations found

### `stem-splitter`

- Built frontend still references `http://127.0.0.1:4195`
- Result: not web-only, still helper/backend dependent
- Current handling: keep hidden by default

### `pdf-toolkit`

- Main browser-side app builds correctly
- `compress/repair` is now explicitly disabled in the GitHub Pages build
- Result: web users get a clear desktop/local-helper-only message instead of a broken localhost expectation

### `bg-remover`

- ONNX wasm files are packaged locally
- The app now uses an explicit `publicPath` for IMG.LY-hosted model resources:
  - `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/`
- Result: dependency is now deterministic instead of silently relying on the library default
- Remaining limitation: model data is still fetched from IMG.LY unless we later self-host the `background-removal-data` package

### `audio-editor` and `video-to-audio`

- Local FFmpeg assets are packaged and served correctly
- Generated worker bundle is post-processed after build
- Result: missing local FFmpeg assets now fail explicitly instead of falling back to remote `unpkg`

### `qr-generator`

- Built output includes `jspdf` optional helper strings that mention external URLs
- These appear tied to optional "open in new window / PDFObject" helper code paths, not the core in-page generation flow

## What was not browser-verified yet

- Actual install prompt behavior in Chrome
- Header-sensitive runtime behavior for all apps in a real browser session
- Offline reopen has only been confirmed for shell + `csv-toolkit`, not the entire app set

## Next manual browser checks

1. Open preview in Chrome: `http://127.0.0.1:4179/`
2. Open at least one lightweight app, then disable network in DevTools
3. Reload shell and reopen the same app
4. Test:
   - `csv-toolkit`
   - `qr-generator`
   - `pdf-toolkit` core tools
   - `audio-editor`
   - `video-to-audio`
   - `bg-remover`
