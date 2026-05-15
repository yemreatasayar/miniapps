# Yeni Uygulama Ekleme Rehberi

## Nasıl Çalışıyor

`build-github-pages.mjs` çalıştırıldığında:

1. `site/` klasörü **tamamen silinir** ve sıfırdan yeniden üretilir
2. Her uygulama `runBuild()` ile build edilir — `MINIAPPS_BASE: "./"` ve `MINIAPPS_OUT_DIR: site/apps/<id>/` env'leri otomatik set edilir
3. Shell (ana sayfa) ayrıca `runShellBuild()` ile build edilir
4. EN kopyalar `buildEnglishAppCopies()` ile `apps-en/` altına üretilir
5. `distribution-config.json`, service worker, sitemap, manifest otomatik üretilir

**ÖNEMLİ:** `site/` klasörüne hiçbir zaman elle dosya kopyalanmamalı veya düzenleme yapılmamalıdır. Her şey `build-github-pages.mjs` üzerinden gelir.

---

## Yeni Uygulama Eklemek İçin

`distribution/github-pages/build-github-pages.mjs` dosyasında 3 yerde değişiklik:

### 1. `apps` dizisine ekle (satır ~13)

```js
{ id: "video-compressor", dir: "video-compressor", script: "build" },
```

### 2. `distributionConfig.visibleAppIds`'e ekle (satır ~31)

```js
"video-compressor",
```

`launchUrlOverrides` otomatik türetiliyor (apps dizisinden), ayrıca eklemeye gerek yok.

### 3. `seoMeta` Map'ine ekle

```js
[
  "video-compressor",
  {
    tr: {
      title: "Video Compressor — Ücretsiz Online Video Sıkıştırıcı",
      description: "Videoları tarayıcınızda sıkıştırın, dönüştürün ve kırpın. MP4, WebM, MOV, AVI, MKV desteği. Sunucuya yükleme yok, hesap gerekmez.",
    },
    en: {
      title: "Video Compressor — Free Online Video Compressor",
      description: "Compress, convert and trim videos in your browser. Supports MP4, WebM, MOV, AVI, MKV. No server upload, no account required.",
    },
  },
],
```

### 4. Uygulama kartı SVG'si

`site/assets/video-compressor-card.svg` otomatik kopyalanmıyor — hangi mekanizmayla geldiği bilinmiyor (shell build mi kopyalıyor?). Kontrol: shell build çıktısında `assets/` içinde var mı bakmak gerekir.

---

## Build ve Deploy

```bash
# 1. Build (tüm uygulamaları yeniden build eder, 5-15 dk sürebilir)
cd /Users/yusufemreatasayar/miniapps
node distribution/github-pages/build-github-pages.mjs

# 2. Commit
git add distribution/github-pages/site/
git commit -m "chore: add video-compressor to distribution"

# 3. Push → GitHub Actions otomatik deploy eder
git push
```

---

## Uyarılar

- `packVersion` scriptte `"2026.1"` — elle güncellenmesi gerekiyorsa buradan değiştirilmeli
- `legacy-en-build/` klasörü EN overlay kaynağı; yeniden build için gerekli ama `.gitignore`'da, repoda yok
- `video-compressor` için legacy EN build gerekmez; EN kopyası `buildEnglishAppCopies()` ile TR build'den otomatik üretilir
