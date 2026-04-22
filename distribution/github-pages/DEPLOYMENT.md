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

### Önemli: EN bg-remover ayrıca senkronize edilmeli

`legacy-en-build/bg-remover/` klasörü gitignore'da ve kaldırıldı.
Yeni build sonrası `apps-en/bg-remover/` TR build'iyle hizalamak için:

```bash
node distribution/github-pages/sync-bg-remover-en.mjs
git add distribution/github-pages/site/apps-en/bg-remover/
```

Bu adım atlanırsa EN bg-remover TR build'iyle senkronize kalır (string replacement
build script'i tarafından otomatik uygulandığı için sorun olmaz, ama sync-bg-remover-en.mjs
çalıştırılmadan önce legacy-en-build/bg-remover yoksa zaten otomatik TR baz alınır).

---

## Gitignore'dan Kalanlar (Yerel Tutulur, Repo'ya Girmez)

| Klasör | Neden |
|---|---|
| `distribution/github-pages/legacy-en-build/` | EN build kaynak dosyaları, büyük binary'ler |
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

### 6. EN bg-remover Senkronizasyonu
`apps-en/bg-remover/` eski bir legacy build'den geliyordu:
- Farklı ONNX versiyonu (`ort.bundle.min-CmHfnmOO.js` vs `DcTrksc9.js`)
- 23 MB ekstra ayrı WASM dosyası

`sync-bg-remover-en.mjs` yazıldı: TR build kopyalanır, EN string replacement'ları uygulanır.
`legacy-en-build/bg-remover/` silindi — gelecek build'lerde otomatik TR baz alınır.

---

## Kalan Açık Görevler

### Görev 5 — Browser'da Offline + PWA Install Testi (Manuel)

**Neden hâlâ açık:** Kod ve build doğru; ancak service worker lifecycle,
install prompt ve gerçek offline davranışı hiç gerçek Chrome oturumunda doğrulanmadı.

**Test adımları:**

```
1. node distribution/github-pages/preview-site.mjs
   → http://127.0.0.1:4179 adresini Chrome'da aç

2. Lightweight bir uygulamayı aç (csv-toolkit veya qr-generator önerilir)

3. DevTools → Application → Service Workers
   → Status: "activated and running" görülmeli

4. DevTools → Network → "Offline" checkbox'ını işaretle

5. Sayfayı yenile
   → csv-toolkit veya qr-generator çalışmaya devam etmeli (cache'den servis)
   → Hiç açılmamış bir uygulamayı dene → offline.html görünmeli

6. Chrome adres çubuğunda install ikonu (⊕) belirir mi kontrol et
   → Tıkla → "Add to Home Screen / Install" akışını tamamla
   → Standalone pencerede açılmalı
```

**Beklenen sorunlar / dikkat noktaları:**
- bg-remover: ONNX model verisi CDN'den geliyor, offline'da model yüklenmez.
  Bu beklenen davranış; uygulama içinde uyarı zaten mevcut.
- audio-editor / video-to-audio: FFmpeg WASM ilk açılışta indirilir ve cache'lenir.
  Offline test için önce online açıp yüklenmeyi beklemek gerekir.
- stem-splitter: hidden, test edilmez.

---

### Görev D — Shell'den İngilizce Uygulama Erişimi (Ertelenmiş)

**Mevcut durum:** `apps-en/<id>/` klasörleri mevcut ve SW tarafından cache'leniyor.
Ancak shell (`index.html`) yalnızca Türkçe; `distribution-config.json`'daki
`launchUrlOverrides` yalnızca `./apps/<id>/` gösteriyor.
İngilizce kullanıcılar `/apps-en/csv-toolkit/` gibi URL'lere doğrudan gitmek zorunda.

**Teknik çözüm yolu:**
`distribution-config.json`'a `locales` veya `enLaunchUrlOverrides` alanı eklenmeli.
Shell kodunun (`miniapps/src/`) tarayıcı diline (`navigator.language`) göre
doğru `launchUrl`'i seçmesi sağlanmalı.
Alternatif: dil seçici UI bileşeni eklenmeli.
Bu değişiklik shell kaynak kodunu gerektiriyor — ayrı bir oturumda ele alınmalı.

---

### Görev E — FFmpeg WASM Duplikasyonu (Ertelenmiş, Düşük Öncelik)

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
