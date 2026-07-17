# Helper Runtime Matrix

Last verified: 2026-07-17

This file records the helper versions that were tested together. Do not update
the media and ML runtimes independently without repeating the regression tests
below.

## Current Known-Good Matrix

| Component | Version | Delivery |
| --- | --- | --- |
| Node.js local runtime | 24.18.0 LTS | Ignored `local-runtime/bin/` binaries, arm64 and x64 |
| FFmpeg / FFprobe | 8.1.2 | Homebrew host runtime for local testing |
| Ghostscript | 10.07.1 | Tracked self-contained macOS bundle in `pdf-compress-server/` |
| LibreOffice | 26.2.4.2 stable | `/Applications/LibreOffice.app` |
| Python | 3.9.6 | Existing ignored Stem Splitter venv |
| Demucs | 4.0.1 | Existing ignored Stem Splitter venv |
| PyTorch / Torchaudio | 2.8.0 / 2.8.0 | Existing ignored Stem Splitter venv |
| Express | 4.22.2 | `stem-splitter/package-lock.json` |
| Multer | 2.2.0 | `stem-splitter/package-lock.json` |
| qs | 6.15.3 | `stem-splitter/package-lock.json` |

Windows x64 uses the same Node, Demucs, Torch and Torchaudio family. Python is
3.11 because the current Demucs 4.0.1 wheel supports it and Python 3.9 is no
longer an appropriate new Windows installation target.

The production dependency audit is clean:

```bash
cd stem-splitter
npm audit --omit=dev
```

The remaining development-only Vite/esbuild advisory requires a Vite 8 major
upgrade. It is intentionally deferred because it does not affect the shipped
helper server and should be handled as a separate frontend migration.

## Packaging Rules

- macOS Ghostscript bundling must run through
  `scripts/bundle-ghostscript-macos.mjs`. `install_name_tool` invalidates
  Mach-O signatures, so every copied dylib and the final executable are
  ad-hoc signed and verified by the script.
- A Stem Helper distribution must use self-contained FFmpeg and FFprobe
  binaries. Homebrew binaries link to Homebrew dylibs and are valid only on
  the build machine. The packaging script rejects them by default.
- `MINIAPPS_STEM_HELPER_ALLOW_DYNAMIC_FFMPEG=1` is allowed only for a
  host-specific test build, never for a user-facing artifact.
- Local Node binaries are ignored by git. Reproducible package builds must
  record the version and SHA-256 values emitted in `runtime-sources.json`.

## Deferred ML Migration

Python 3.9 is end-of-life, but Demucs 4.0.1 is the latest stable Demucs release
and the upstream project is no longer actively maintained. Replacing Python,
Torch, Torchaudio, and Demucs in place is therefore higher risk than the
patch-level helper updates in this maintenance pass.

The future migration must:

1. Build a parallel venv instead of modifying the known-good venv.
2. Run model warm-up and two-stem export on the same reference audio.
3. Compare duration, codec, loudness, and audible separation.
4. Switch the helper config only after both environments pass.

## Regression Record

Tests completed on macOS arm64:

- Node 24.18.0 executed on arm64 and x64 binaries.
- PDF helper health detected Ghostscript 10.07.1 and LibreOffice 26.2.4.2.
- The browser-side PPTX chart normalizer passed 10 synthetic inheritance,
  explicit-override, malformed-XML, signed-package, and size-limit checks.
- The Open Sans chart-label regression normalized all six inherited `bold`
  runs. LibreOffice produced a one-page PDF containing all category/value text
  and only embedded `OpenSans-Bold`, matching the PowerPoint thumbnail.
- A 12 MB, 19-page PPTX converted successfully to a 2.05 MB PDF.
- The converted PDF retained 19 pages and 52 image objects; the first three
  rendered pages, including small embedded icons, were visually checked again
  after the PPTX normalizer change. The chart-free package remained source
  passthrough (`changed: false`).
- Ghostscript balanced compression produced a valid 663 KB, 19-page PDF.
- Ghostscript repair produced a valid 1.44 MB, 19-page PDF.
- Stem Helper warm-up completed with `htdemucs`.
- An 8-second WAV upload produced separate, valid 320 kbps MP3 vocal and
  instrumental outputs after the Express/Multer security patches.
- The installed LaunchAgent helper was updated to Node 24.18.0, host FFmpeg
  8.1.2, Express 4.22.2, and Multer 2.2.0; its production audit and a second
  two-stem API export both passed.

Windows validation is performed by `.github/workflows/windows-helpers.yml` on
an actual `windows-latest` runner. The release asset is published only after:

- the packaged installer completes in a clean user profile,
- Demucs warm-up reaches `ready`,
- an 8-second WAV produces valid vocal and instrumental MP3 outputs,
- a PPTX containing text and a small embedded PNG converts to a one-page PDF,
- the converted PDF retains both extractable text and an image XObject.

The full Windows x64 regression passed in GitHub Actions run
[`29579476681`](https://github.com/yemreatasayar/miniapps/actions/runs/29579476681)
on 2026-07-17. The published `stem-helper-windows.zip` is 35,617,861 bytes
with SHA-256
`3411335e30d0419ff5aa045c2dea071f22da4e17996e449b2a2cbb67b92edb1a`.
The clean-run test covered installer startup, CPU Demucs warm-up, two valid
MP3 stems, LibreOffice PPTX conversion, extractable PDF text, and retention of
the embedded image.
