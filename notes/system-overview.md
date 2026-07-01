# miniapps Sistem Genel Bakış

## Repo Yapısı

```
miniapps/
├── miniapps/              # Shell (ana ekran) — her iki versiyonu da karşılar
├── local-runtime/         # Local launcher sistemi
├── distribution/
│   └── github-pages/
│       ├── build-github-pages.mjs   # TEK build scripti — web sitesini üretir
│       ├── site/                    # Pre-built statik çıktı (ELLE DOKUNMA)
│       ├── legacy-en-build/         # .gitignore'da; eski EN app kaynak kopyaları
│       └── ADD-NEW-APP.md           # Yeni uygulama ekleme rehberi
├── <app-name>/            # Her uygulama kendi klasöründe (vite + react)
│   ├── src/
│   ├── public/
│   ├── dist/              # Local build çıktısı (launcher tarafından sunulur)
│   └── vite.config.ts
└── notes/                 # Bu klasör — kalıcı kararlar ve mimari notlar
```

---

## İki Farklı Ortam: Local ve Web

### Local (Kişisel Kullanım)

- **Amaç:** Sadece kendi bilgisayarında kullanım.
- **Shell:** `miniapps/` → `dist-internal/` → port 4181
- **Uygulamalar:** Her biri kendi portunda: `<app>/dist/` klasöründen servis edilir
- **Launcher:** `local-runtime/launcher.mjs` tüm portları ayağa kaldırır
- **Dil:** Sabit TR — local'de dil toggle'ı yok, `/apps-en/` URL'i olmaz
- **Footer:** miniapps logosu YOK — sadece web'de görünür
- **Config:** `local-runtime/launcher-config.json` hangi uygulamanın hangi portta çalışacağını tanımlar
- **Shell tipi:** `App.tsx` (personal) — müşteri yönetimi, PIN korumalı admin, uygulama sıralama var

### Web (miniapps.tr — Herkese Açık)

- **Amaç:** GitHub Pages üzerinden yayınlanan public site
- **URL:** https://miniapps.tr (custom domain, GitHub Pages)
- **Shell:** `miniapps/` → `distribution.html` → `site/index.html`
- **Uygulamalar:** `site/apps/<id>/` (TR) ve `site/apps-en/<id>/` (EN)
- **Dil:** Shell'de TR/EN toggle var (sağ üst). Uygulama linki buna göre `/apps/` veya `/apps-en/` olarak açılır
- **Footer:** Her uygulamanın en altında miniapps logosu görünür
- **Shell tipi:** `DistributionApp.tsx` — sadece uygulama grid ve dil seçimi, müşteri yönetimi yok

---

## Local vs Web — Uygulama Kodu Farkları

Her uygulama AYNI kaynak kodunu paylaşır. Farkları runtime'da anlaşılır:

| Özellik | Local | Web (miniapps.tr) |
|---|---|---|
| Dil | Sabit TR | URL'den auto-detect (`/apps-en/` → EN) |
| miniapps footer logosu | Gösterilmez | Gösterilir |
| `isDistribution` flag | `false` | `true` |
| MINIAPPS_BASE (build) | `/` (default) | `./` (relative) |

### `isDistribution` nasıl çalışır?

```ts
// video-compressor/src/App.tsx örneği
const isDistribution = typeof window !== "undefined" && window.location.hostname === "miniapps.tr";
```

- Local: `127.0.0.1` → `false` → footer yok
- Web: `miniapps.tr` → `true` → footer görünür

### Dil auto-detection (uygulama içi)

```ts
// video-compressor/src/lib/i18n.ts — readStoredLang()
if (window.location.pathname.includes("/apps-en/")) return "en";
return "tr";
```

- Local'de URL `http://127.0.0.1:4324/` → TR
- Web TR'de URL `.../apps/video-compressor/` → TR
- Web EN'de URL `.../apps-en/video-compressor/` → EN
- Toggle yok, locale URL'den belirleniyor

---

## Web Deploy Akışı

### 1. build-github-pages.mjs Nasıl Çalışır?

```
node distribution/github-pages/build-github-pages.mjs
```

1. `site/` klasörü **tamamen silinir** (rmSync)
2. Shell `distribution.html` → `site/index.html` olarak build edilir (`vite.distribution.config.ts`)
3. Her uygulama `runBuild()` ile build edilir:
   - `MINIAPPS_BASE: "./"` → asset path'leri relative
   - `MINIAPPS_OUT_DIR: site/apps/<id>/` → doğrudan hedef klasöre build
4. SEO meta (title, description, OG tags) her app'ın `index.html`'ine enjekte edilir
5. TR build bittikten sonra `buildEnglishAppCopies()` ile `site/apps-en/` üretilir:
   - TR assets kopyalanır, index.html lang="en" yapılır
   - Bazı eski uygulamalar için `legacy-en-build/` overlay yapılır
6. `distribution-config.json`, `service-worker.js`, `sitemap.xml`, `manifest.webmanifest` üretilir
7. `.nojekyll` eklenir (GitHub Pages Jekyll'ı devre dışı bırakır)

### 2. Commit & Push

```bash
git add distribution/github-pages/site/
git add distribution/github-pages/build-github-pages.mjs  # değiştiyse
git add <app>/src/                                          # kaynak değiştiyse
git commit -m "chore: rebuild distribution"
git push
```

GitHub Actions (`.github/workflows/deploy.yml`) otomatik tetiklenir:
- `distribution/github-pages/site/**` değiştiğinde deploy eder
- `site/` klasörünü olduğu gibi GitHub Pages'e yükler, CI'da ayrıca build yapılmaz

### ÖNEMLİ

- `site/` klasörüne **asla elle dosya kopyalanmaz, asla elle düzenleme yapılmaz**
- Her değişiklik scriptten geçmeli
- Eski bundle hash'leri otomatik değişir (önceki JS dosyaları silinir, yeniler eklenir)

---

## Uygulama Sıralama Prensibi (Web — visibleAppIds)

Kartlar kullanıcıya ilişkili gruplar halinde gösterilir. Mevcut sıra ve mantık:

```
pdf-toolkit            ← Belge işleme
csv-toolkit            ← Veri işleme
qr-generator           ← Üretim araçları
image-toolkit          ← Görsel işleme
exif-cleaner           ↑
image-format-converter ↑
bg-remover             ↑
video-to-audio         ← Video/Ses işleme
video-compressor       ↑
audio-editor           ↑
stem-splitter          ↑
dev-toolkit            ← Geliştirici araçları
```

Yeni uygulama eklenirken `build-github-pages.mjs`'deki `visibleAppIds` dizisinde mantıksal grubuna göre konumlandır.

---

## Local Deploy Akışı

### Tek Uygulama Güncelleme

```bash
cd <app-name>
npm run build        # → dist/ klasörüne yazar, MINIAPPS_BASE=/ (default)
```

Local launcher restart gerekmez — `dist/` klasörü statik serve ediliyor.

### Shell Güncelleme

```bash
cd miniapps
npm run build:personal  # → dist-internal/ klasörüne yazar
```

Launcher restart gerekebilir (shell dist-internal'ı serve ediyor).

---

## Yeni Uygulama Ekleme Kontrol Listesi

### Local İçin (5 yer)

1. **`miniapps/src/App.tsx`** — `INTERNAL_APPS`, `SHARED_APP_DISPLAY_ORDER`, `DEFAULT_AUTO_ATTACH_APP_IDS`, müşteri atama dizileri, `normalizeApps()` içindeki son ekleme bloğu
2. **`local-runtime/launcher-config.json`** — yeni port ile sunucu kaydı
3. **`miniapps/src/App.tsx`** içinde port sabiti (`const X_URL = "http://127.0.0.1:<port>/"`)
4. **`miniapps/dist-internal/`** — shell yeniden build edilmeli
5. **`<app>/dist/`** — uygulama build edilmeli

### Web İçin (3 yer — build-github-pages.mjs)

1. `apps` dizisi → `{ id: "...", dir: "...", script: "build" }`
2. `distributionConfig.visibleAppIds` → uygulama id'si
3. `seoMeta` Map → TR ve EN title/description

Ardından:
```bash
node distribution/github-pages/build-github-pages.mjs
git add distribution/github-pages/site/ distribution/github-pages/build-github-pages.mjs
git commit && git push
```

---

## Shell Farkı: App.tsx vs DistributionApp.tsx

| | `App.tsx` (local/personal) | `DistributionApp.tsx` (web) |
|---|---|---|
| Dil | TR sabit | TR/EN toggle (shell seviyesinde) |
| Müşteri yönetimi | Var (localStorage) | Yok |
| Admin PIN | Var | Yok |
| Uygulama sıralama | Var | Yok (distribution-config.json sırası) |
| Lansman URL | `http://127.0.0.1:<port>/` | `./apps/<id>/` veya `./apps-en/<id>/` |
| Build komutu | `npm run build:personal` → `dist-internal/` | build-github-pages.mjs içinde `build:distribution` → `site/` |

---

## Portlar (Local)

| Uygulama | Port |
|---|---|
| miniapps shell | 4310 |
| weekly-bulletin | 4311 |
| qr-generator | 4312 |
| pdf-toolkit | 4313 |
| image-toolkit | 4315 |
| video-to-audio | 4316 |
| csv-toolkit | 4317 |
| bg-remover | 4318 |
| stem-splitter | 4194 |
| audio-editor | 4320 |
| exif-cleaner | 4321 |
| image-format-converter | 4322 |
| dev-toolkit | 4323 |
| video-compressor | 4324 |
| pdf-compress-server | 4184 |

---

## video-compressor Özel Notlar

- **FFmpeg:** `@ffmpeg/ffmpeg` WASM v0.12 — COOP/COEP header'ları zorunlu (SharedArrayBuffer için)
- **Multi-segment render:** `filter_complex` KULLANILAMAZ — WASM'da "memory access out of bounds" hatası verir. Her segment ayrı encode edilip `-f concat` ile birleştirilmeli.
- **Build:** `vite.config.ts`'de `optimizeDeps.exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"]` zorunlu
- **COOP/COEP:** Local launcher config'de ve vite dev server'da header'lar tanımlı
- **Dil:** `LangContext.tsx` + `i18n.ts` — URL path'e göre auto-detect, toggle yok
- **Footer logo:** `isDistribution` guard arkasında — sadece `miniapps.tr` hostname'inde görünür
- **`miniapps-logo-dark.svg`:** `video-compressor/public/assets/` içinde bulunması gerekir (build script kopyalar)
- **Segment geçmişi:** `CutPanel.tsx` sadece `settings.segments` için 5 adımlık undo/redo tutar. `Böl`, `Sil`, `Sıfırla` ve segment kenarı trim hareketleri geçmişe girer; oynatma/scrub hareketleri geçmişi kirletmez. Trim sürükleme boyunca anlık UI güncellenir, `mouseup` sonrası tek hareket olarak kaydedilir.

---

## .gitignore'da Olanlar (Yerel Tutulur)

- `distribution/github-pages/legacy-en-build/` — EN overlay kaynakları (yeniden build için gerekli)
- `local-runtime/bin/` — Node.js binary'leri (100MB+)
- `stem-splitter/backend/.venv/` — Python env
- `**/node_modules/`
- `**/dist/`, `**/dist-internal/` (`site/` hariç)
