# GitHub Pages Deployment

## Canlı URL

```
https://yemreatasayar.github.io/miniapps/
```

---

## Deployment Nasıl Çalışır

`distribution/github-pages/site/` klasörü pre-built statik site çıktısıdır.
`main` branch'ına her push'ta `.github/workflows/deploy.yml` otomatik tetiklenir
ve bu klasörü doğrudan GitHub Pages'e deploy eder. CI'da build yapılmaz.

---

## Yeni Build Sonrası Push Adımları

Site yeniden build edildiğinde (`node distribution/github-pages/build-github-pages.mjs`):

```bash
# 1. Değişiklikleri stage et
git add distribution/github-pages/site/

# 2. Commit at
git commit -m "chore: rebuild GitHub Pages site"

# 3. Push et — workflow otomatik deploy eder
git push
```

Başka kaynak dosya değişikliği varsa onları da aynı commit'e ekle.

### Önemli: EN build tek tip değil, hibrit üretiliyor

`apps-en/` çıktısı şu anda iki farklı kaynaktan oluşur:

- `distribution/github-pages/legacy-en-build/` içinde bulunan uygulamalar
  build sonunda doğrudan buradan overlay edilir.
- Bu klasörde bulunmayan uygulamalar TR/current build baz alınarak
  `build-github-pages.mjs` içindeki dönüştürmelerle üretilir.

Mevcut `legacy-en-build/` içeriği:

```text
audio-editor
csv-toolkit
dev-toolkit
exif-cleaner
image-format-converter
miniapps-shell
pdf-toolkit
qr-generator
video-to-audio
```

Önemli ayrım:

- Canlı site çalışırken `legacy-en-build/` klasörüne ihtiyaç yoktur.
- Ama başka bir makinede yeniden build almak istiyorsan bu klasör EN overlay
  kaynağı olarak gereklidir.
- `bg-remover` ve `image-toolkit` gibi burada bulunmayan uygulamalar EN tarafta
  mevcut build script'i ile üretilir; ayrıca manuel sync adımı gerekmez.

---

## Gitignore'dan Kalanlar (Yerel Tutulur, Repo'ya Girmez)

| Klasör | Neden |
|---|---|
| `distribution/github-pages/legacy-en-build/` | EN overlay kaynakları; runtime bağımlılığı değil ama yeniden build için gereklidir |
| `distribution/miniapps-en-mac/` | Desktop Mac build çıktısı, web'e ilgisi yok |
| `local-runtime/bin/` | Node.js binary'leri, 100 MB+ |
| `stem-splitter/backend/.venv/` | Python sanal ortamı, PyTorch dahil |
| `**/node_modules/` | npm bağımlılıkları |
| `**/dist/`, `**/dist-internal/` | App build çıktıları (site/ hariç) |

---

## Tamamlanan Düzeltmeler (2026-04-22)

### 1. PWA Manifest — Maskable Icon
`manifest.webmanifest` ve `buildManifest()` fonksiyonuna `purpose: "maskable"` olan
ikinci bir SVG icon girişi eklendi (`miniapps-icon-maskable.svg`).
Android adaptive icon desteği için zorunludur; olmadığında Lighthouse uyarı verir.

### 2. Service Worker — stem-splitter APP_ENTRY_URLS'den Çıkarıldı
`build-github-pages.mjs`'de `appEntryUrls` artık `distributionConfig.visibleAppIds`
üzerinden üretiliyor. stem-splitter `hiddenAppIds`'de olduğu için SW'ye girmiyor.
Önceki davranış: hidden uygulama APP_CACHE'e alınıyordu.

### 3. FFmpeg Worker — unpkg Fallback Giderildi
`hardenFfmpegWorkerFallbacks()` fonksiyonu eklendi. Build sonrası
`apps/` ve `apps-en/` altındaki `audio-editor` ve `video-to-audio` worker bundle'larını
tarar; `unpkg.com` fallback URL'ini `__MINIAPPS_LOCAL_FFMPEG_REQUIRED__` sabitiyle
ve fallback mantığını hata fırlatacak şekilde değiştirir.
Önceki risk: `coreURL` geçilmezse sessizce `unpkg.com`'a bağlanılıyordu.

### 4. bg-remover — Offline Uyarısı
bg-remover web build'inde model verisi IMG.LY CDN'den yükleniyor
(`staticimgly.com/@imgly/background-removal-data/`). Service worker cross-origin
istekleri intercept etmediğinden bu veri offline'da çalışmaz.
Uygulama bundle'ına Türkçe uyarı eklendi:
_"dosyalarını internetten indirir; ilk kurulum tamamlanmadan offline çalışmaz."_

### 5. GitHub Actions Deploy Workflow
`.github/workflows/deploy.yml` oluşturuldu.
`main` branch'ına `distribution/github-pages/site/**` altında değişiklik geldiğinde
veya `workflow_dispatch` ile manuel tetiklendiğinde `actions/deploy-pages` ile deploy eder.

### 6. EN Kaynak Yapısı — `legacy-en-build/`

İngilizce build artık dışarıdaki `miniapps-en-mac/` klasörüne bağlı değildir.
Gerekli legacy EN kaynakları `distribution/github-pages/legacy-en-build/`
altına alınmıştır.

`build-github-pages.mjs` akışı:

- önce `apps-en/` current build'den üretilir
- sonra `legacy-en-build/` içindeki mevcut app'ler `apps-en/` üstüne overlay edilir
- HTML path'leri `./assets/...` ve `./ffmpeg/...` formatına normalize edilir
- `<html lang="en">` olacak şekilde düzeltilir

Bu sayede çalışma anında dış klasöre bağımlılık yoktur. Yalnızca yeniden build
alırken `legacy-en-build/` klasörü yerelde bulunmalıdır.

### 7. QR Generator — Metinler Güncellendi

**Kaldırılan:** `Geçmiş Tasarımlar` bölüm başlığının altındaki
_"Bu müşteriye ait kayıtları aç, düzenle veya sil"_ alt metni kaldırıldı.

**Değiştirilen boş durum metinleri:**
- `"Bu müşteri için kayıt yok."` → `"Henüz kayıt yok."`
- `"Yeni QR oluşturup kaydettiğinde burada yalnızca bu müşteriye ait tasarımlar görünecek."` → `"Eski tasarımlarını bu alandan görebilirsin."`

EN karşılıkları:
- `"No records yet."`
- `"You can view your past designs from this section."`

`build-github-pages.mjs` ve `sync-qr-generator-en.mjs` güncellendi.
TR ve EN site çıktıları yeniden build edildi.

### 8. Image Toolkit — Smart Compress Düzeltmesi

**Sorun:** `computeSmartQualities` fonksiyonunda en düşük BPP'li görsel her zaman
`quality = 1.0` (sıkıştırma yok) üretiyordu. Slider maksimumda bile o görsel
hiç küçülmüyordu.

**Kök neden:** `normalizedScore = 0` olan görsel için `1 - slider × 0 = 1.0`.

**Düzeltme:** `quality-estimator.ts`'de score remaplendi:
```ts
// Eski
Math.max(0.1, 1 - slider * score)

// Yeni
Math.max(0.1, 1 - slider * (0.15 + 0.85 * score))
```
Artık slider maksimumda en düşük BPP'li görsel `quality = 0.85` alıyor (~%15 sıkıştırma garantili).

`legacy-en-build/image-toolkit/` bilinçli olarak tutulmuyor; EN build bu app için
TR/current build baz alınarak üretiliyor.

---

### 9. bg-remover — EN Üretim Akışı

`legacy-en-build/bg-remover/` tutulmuyor.
Bu app için EN çıktı current/TR build'den üretilir.

Sebep:
- eski legacy build farklı ONNX bundle sürümü taşıyordu
- gereksiz büyük ek WASM dosyası üretiyordu
- current build ile hizalı kalmak daha güvenli

Bu nedenle bg-remover için ayrıca manuel senkronizasyon gerekmez; normal build akışı yeterlidir.

---

## Kalan / Opsiyonel Kontroller

### 1. PWA Install Akışı — Kapatıldı (2026-04-23)

Kapatma gerekçesi: offline davranış ve service worker logic yerelde doğrulandı,
canlı deploy çalışıyor. Hedef cihaz testi ertelendi; stem-splitter Faz 2-4
tamamlandıktan sonra shell yeniden rebuild edileceği için o noktada bütünleşik
bir PWA testi daha anlamlı olacak.

---

### 2. EN/TR Shell Geçişi — Tamamlandı

Shell içinde `TR / ENG` seçici vardır.
`DistributionApp.tsx` içindeki `getLocalizedLaunchUrl()` fonksiyonu
uygulama linklerini `./apps/<id>/` ve `./apps-en/<id>/` arasında değiştirir.

Not:
- dil tercihi `localStorage` içinde tutulur
- shell chrome'u bu tercihe göre değişir
- EN app içeriği hibrit build mantığıyla `apps-en/` altından servis edilir

---

### 3. FFmpeg WASM Duplikasyonu (Ertelenmiş, Düşük Öncelik)

**Mevcut durum:** `ffmpeg-core.wasm` (31 MB) dört kez mevcut:
- `apps/audio-editor/ffmpeg/`
- `apps/video-to-audio/ffmpeg/`
- `apps-en/audio-editor/ffmpeg/`
- `apps-en/video-to-audio/ffmpeg/`

**Teknik çözüm yolu:**
Tüm dört uygulama aynı WASM dosyasını ortak bir path'ten yükleyecek şekilde
build yapılandırılabilir (örn. `./shared/ffmpeg/ffmpeg-core.wasm`).
Her uygulamanın `coreURL` ve `wasmURL` parametrelerini bu ortak path'e
işaret edecek şekilde güncellenmesi gerekir.
Tasarruf: ~93 MB (3 kopya × 31 MB).
Risk: build sistemi değişikliği gerektirir, yanlış path ile FFmpeg yüklenmez.
