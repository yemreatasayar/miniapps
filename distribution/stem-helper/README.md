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
