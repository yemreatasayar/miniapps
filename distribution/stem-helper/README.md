# Stem Helper Packaging

Bu klasor, `stem-splitter` icin helper packaging kaynaklarini tutar.

Klasor ayrimi:

- `distribution/stem-helper/`
  Packaging scriptleri ve runtime template kaynaklari.
- `distribution/stem-helper-mac/`
  Build script'in urettigi kullaniciya verilecek macOS helper paketi.

Ana komut:

```bash
node distribution/stem-helper/build-stem-helper-mac.mjs
```

Desteklenen env girisleri:

- `MINIAPPS_STEM_HELPER_NODE_SRC`
- `MINIAPPS_STEM_HELPER_PYTHON_SRC`
- `MINIAPPS_STEM_HELPER_FFMPEG_SRC`
- `MINIAPPS_STEM_HELPER_FFPROBE_SRC`

Env degerleri verilmezse build script paket iskeletini ve runtime placeholder
dosyalarini uretir. Boylece installer ve package layout calismasi runtime
binary sourcing bloklansa bile ilerleyebilir.

Dagitilacak macOS paketinde FFmpeg ve FFprobe self-contained olmalidir.
Homebrew binary'leri harici dylib'lere bagliysa build guvenlik amaciyla durur.
`MINIAPPS_STEM_HELPER_ALLOW_DYNAMIC_FFMPEG=1` yalnizca ayni makinedeki gecici
test paketleri icin kullanilmalidir; kullaniciya verilecek pakette kullanilmaz.

## Windows paketi

Windows x64 paketi GitHub Actions `windows-latest` ortaminda uretilir:

```bash
node distribution/stem-helper/build-stem-helper-windows.mjs
```

Paket Node 24 runtime'ini tasir. Kurulum Python 3.11, FFmpeg ve LibreOffice'u
WinGet ile kullanici makinesine kurar; Demucs 4.0.1 + Torch/Torchaudio 2.8.0
ayri bir venv icinde tutulur. Ayni paket Vocal Remover (`4195`) ve PDF/Office
helper (`4184`) servislerini baslatir.
