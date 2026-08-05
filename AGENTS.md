# AGENTS.md — MiniApps ortak ajan beyni

Bu dosya **Codex ve Claude'un ortak, kalıcı çalışma belleğidir.** Her oturumda
ikisi de okur (Claude `CLAUDE.md` → `@AGENTS.md`). Koddan türetilemeyen kalıcı
bilgiler buraya. **Changelog değil** (onu git tutar): kararlar, tuzaklar, kurallar.

> **Bakım kuralı (ikimiz de):** Koddan anlaşılmayan bir karar/tuzak/konvansiyon
> olunca ilgili bölümü **kısaca** güncelle. Yalın tut; detayı `notes/`'a yaz, buradan işaret et.

---

## Ne bu?

Küçük araçların (QR, PDF, görsel, ses, CSV, exif vb.) koleksiyonu. **İki ortam,
tek kaynak kod:**
- **Local (kişisel):** sadece senin cihazın için, TR sabit, footer logosu yok.
- **Web (miniapps.tr, GitHub Pages):** herkese açık, TR/EN, miniapps footer logosu.

## Yapı (monorepo)

- Her uygulama kendi kök klasörü (`qr-generator/`, `pdf-toolkit/`, `image-toolkit/` …) + kendi `dist/`.
- **Shell:** `miniapps/` — `miniapps/src/App.tsx` (local: müşteri yönetimi, PIN'li admin, sıralama, TR sabit) vs `miniapps/src/DistributionApp.tsx` (web: app grid + TR/EN toggle, `./apps/<id>/` URL).
- **Web build:** `distribution/github-pages/build-github-pages.mjs` → `distribution/github-pages/site/` (HER ŞEYİ sıfırdan üretir).
- **Local runtime:** `local-runtime/launcher.mjs` her app'i kendi portunda serve eder (shell:4310).
- **Tam mimari, port listesi, app-ekleme detayı:** `notes/system-overview.md`.

## Ortam ayrımı (kritik)

- `isDistribution = (typeof window !== "undefined" && window.location.hostname === "miniapps.tr")` → local'de false, web'de true. Footer logosu bu guard arkasında.
- **Dil:** **Local shell TR sabit** (toggle yok). **Public shell'de** (`miniapps/src/DistributionApp.tsx`) **TR/EN toggle var**; app linkleri `apps/` ↔ `apps-en/` olarak değişir. Uygulama içi dil URL'den auto-detect: `pathname.includes("/apps-en/")` → EN, değilse TR.

## Build / Deploy

**Web (miniapps.tr):**
1. Gerekirse `build-github-pages.mjs`'yi düzenle (apps dizisi, `visibleAppIds`, seoMeta).
2. `node distribution/github-pages/build-github-pages.mjs` (site/ tamamen yeniden üretilir, ~10-15 dk).
3. `git add distribution/github-pages/site/` (+ değişen kaynak/script) → commit → `git push`.
4. **GitHub Actions** `site/**` değişince otomatik deploy eder.

**Local (kişisel kullanım):**
- App: `cd <app> && npm run build` (→ `dist/`)
- Shell: `cd miniapps && npm run build:personal` (→ `dist-internal/`)

## ASLA dokunma

- **`distribution/github-pages/site/`'a ELLE DOKUNMA.** Build scriptinin çıktısıdır; her çalıştırmada silinip yeniden üretilir → elle yapılan kaybolur, hatta ana JS bundle referansı bozulabilir (önceden oldu). Tüm web değişiklikleri `build-github-pages.mjs`'ye yapılır, sonra script çalıştırılır, sadece çıktı commit edilir.

## Tuzaklar (landmine'lar)

- **Yeni app eklemek = TEK yer yetmez.** Local shell'de kart görünmesi için `miniapps/src/App.tsx`'te **5 yer** güncellenmeli: (1) URL sabiti, (2) `INTERNAL_APPS`, (3) `SHARED_APP_DISPLAY_ORDER`, (4) `DEFAULT_AUTO_ATTACH_APP_IDS`, (5) `initialCustomerApps` içindeki **her müşteri**. Ayrıca: `miniapps/public/distribution-config.json` (`visibleAppIds` + `launchUrlOverrides`), `miniapps/src/DistributionApp.tsx` (`defaultApps` + `renderAppCardArt`), `local-runtime/launcher-config.json` (yeni port). (Kart çıkmıyorsa: müşteri ataması unutulmuştur.)
- **Yeni port seçerken** önce `lsof -i :PORT` ile boş olduğunu doğrula (çakışma yaşandı).
- **Public footer (`.distribution-header`) sabit konumlu** (`position: fixed; bottom: 0`); yüksekliği `--distribution-footer-height` CSS değişkeniyle workspace'e boşluk olarak rezerve edilir. Footer içeriğini değiştirince (satır ekle/çıkar) bu değişkeni **her breakpoint'te** (980/760/560px) güncelle, yoksa alt grid'de boşluk/üst üste binme olur. Güncel rezervler: masaüstü 104px, ≤980px 148px, ≤760px 96px, ≤560px 122px. Mobilde (≤760px) sürüm metni (`.distribution-version` = "miniapps pack … by y.e.a.") `display:none` ile gizli; Manifesto + TR/ENG butonları küçültülür.
- **İngilizce app build'leri arşivden overlay edilmez.** `apps-en/` her zaman aynı çalıştırmada üretilen güncel `apps/` çıktısından kopyalanıp yerelleştirilir. `legacy-en-build/` paketlerini sonradan bindirmek İngilizce sayfaları sessizce eski sürüme döndürür.
- **Standart giriş ekranları** (PDF/QR gibi özel akışlar hariç): içerik en fazla `1480px`, logo satırı masaüstünde `76px`/mobilde `64px`, hero masaüstünde eşit iki kolon ve yaklaşık `480–590px`, `1120px` altında tek kolon. Başlık ve yükleme yüzeyi aynı dikey eksende başlamalı; yeni araçlarda bu ritmi koru.
- **Sticky footer (miniapps logosu dibe pinli) — 3 tuzak var.** Tüm dağıtım app'lerinde `#root { flex-column; min-height:100vh }` + `.<shell> { flex:1 0 auto; width:100%; padding-bottom:0 }` + `.miniapps-footer { margin-top:auto }` (global.css sonuna append). (1) **`margin:0 auto` flex'te büzülür** → shell'e `width:100%` şart (yoksa içerik ortada küçük kalır, örn. dev-toolkit 1280→939px). (2) **Shell `padding-bottom` footer'ı yukarı iter** (footer içerik-kutusu dibine pinlenir, padding altında kalır) → append'te `padding-bottom:0`. (3) **QR açık `width: calc(100vw - 40px)` kullanır** (max-width değil) → ona `width:100%` **verme**, kenara yapışır. INSIDE-main app'lerde shell `grid→flex-column`'a çevrilir (tek-kolon için güvenli); QR footer'ı `</main>` dışındadır, grid kalır. Detay: `notes/ui-standardization-and-windows-test.md`.
- **Dağıtım ana sayfası büyük ekranda küçük kalıyordu:** app grid `max-width:1320px`'de sabitti, >1600px'te `min-width` kuralı yoktu. `miniapps/src/styles/global.css`'te `@media (min-width:1601px)` ile `clamp(1320px, calc(100vw - 360px), 1900px)` akıcı büyüme eklendi (1920→1560, 2560→1900; ≤1600 değişmez). Kartlar `1fr` olduğu için grid genişleyince ikonlar büyür.
- **Windows stem-helper installer'ı ZIP'ten ÇIKARTILARAK çalıştırılmalı.** `.cmd` kardeş `.ps1`'i `%~dp0` ile çağırır; ZIP içinden çalıştırılırsa `.ps1` temp'e çıkmaz → sessiz başarısızlık (eskiden yine "Installation completed" yazıyordu). `.cmd`'de guard var. Helper `0.2.1` yarıda kalan kurulum için log/state + pip cache tutar ve geçerli `runtime\stem\.venv`'i yeniden kurulumda korur. Template değişikliği `windows-helpers.yml` ile yeni helper build'i gerektirir.
- **ffmpeg.wasm apps'i (video-to-audio, audio-editor) single-thread core kullanır; COOP/COEP EKLEME.** `@ffmpeg/core` paketi `ffmpeg-core.js` + `.wasm` içerir; `ffmpeg-core.worker.js` ve SharedArrayBuffer gerektirmez. Uygulamaları cross-origin-isolated saymak public'te wrapper worker'ını COEP ile blokladı ve olmayan core worker 404'ü üretti. Vite/SW isolation kodu kaldırıldı; yalnız single-thread asset'leri kopyalanır. Detay: `notes/ui-standardization-and-windows-test.md`.
- **PPTX→PDF grafik metni yatay "squish" — LibreOffice sınırlaması, ÇÖZÜLEMEZ.** Yatay bar chart'larda LibreOffice tüm grafik metnini yatayda anamorfik eziyor (PDF `Tm`'de a≠d, ör. a/d=0.921); sadece kutu oranına/grafik türüne bağlı (doughnut etkilenmez). Sürümden (25.8/26.2/26.8 aynı), gruptan, chart XML özelliklerinden (rot/autofit/kern/layout/label pozisyonu) bağımsız. Saf-XML manualLayout tweak'i tutarsız/marjinal (f1 0.921→0.935, manualLayout'suz grafiklerde etkisiz); UNO `RelativeSize(1,1)` en fazla 0.95 (+ ağır makro pipeline). Ayrıca ondalık `,`→`.`: kaynak `<c:lang val="en-US"/>`; tek çözüm veri etiketi format koduna `[$-41F]` LCID prefix'i. **Tekrar denemeden önce oku:** `notes/pptx-pdf-libreoffice-chart-squish.md` (tam deney kaydı + alternatifler). Düzgün ücretsiz drop-in alternatif yok (Collabora=aynı motor; OnlyOffice belirsiz; PowerPoint otomasyonu birebir doğru ama Office gerekli + sadece local; Aspose ücretli).

## Güncel durum

- Local + web stabil.
- **Son değişiklikler** (tarihli, son birkaçı tut): 2026-08-05 — Windows bilgisi ana footer'dan kaldırıldı; yalnız helper gerektiren PDF Toolkit ve Stem Splitter giriş ekranlarına, başlık açıklamasının sonuna aynı sade `Windows bilgisi` açılır standardı eklendi. 2026-08-04 — Windows helper `0.2.1`: installer numaralı ilerleme + kalıcı log/state/pip cache kazandı; sağlıklı Vocal Remover venv'i yeniden kurulumda korunur, ikinci kurulum CI smoke testine eklendi ve eski süreç sonlandırma MiniApps node yolu doğrulamasıyla güvenli hale getirildi. video-to-audio/audio-editor'ın single-thread `@ffmpeg/core` kullandığı doğrulandı; yanlış COOP/COEP/SharedArrayBuffer yolu ve olmayan `ffmpeg-core.worker.js` beklentisi kaldırıldı. Tam public build başarılı. 2026-08-04 — UI standardizasyonu + Windows test turu: (a) tüm dağıtım app'lerinde miniapps footer'ı viewport dibine pinlendi (sticky footer; 3 tuzak → Tuzaklar), üst logolar 76/64'e hizalandı (pdf 92→76, dev-toolkit 96→76), sırasıyla çıkan `width:100%` (shrink), `padding-bottom:0` (footer yukarıda) ve QR kenar-yapışması regresyonları düzeltildi. (b) Ana sayfa app grid'i büyük ekranlarda (>1600px) akıcı büyüyecek şekilde ayarlandı. (c) QR generator public'te ilk-ziyaretçiye gösterilen seeded örnek QR'lar (birinde gerçek isim) kaldırıldı → boş geçmişle başlar. (d) Windows stem-helper installer'ı ZIP içinden çalışınca sessiz başarısız oluyordu → `.cmd`'ye guard. Detay: `notes/ui-standardization-and-windows-test.md`. 2026-07-30 — PPTX→PDF grafik metni yatay squish'i derinlemesine araştırıldı; LibreOffice chart motorunun anamorfik metin ölçeklemesi olduğu, sürüm/grup/chart-XML'den bağımsız olduğu kanıtlandı. Saf-XML çözüm tutarsız/marjinal, UNO kısmi+ağır, ücretsiz drop-in alternatif yok → **bilinçli olarak düzeltme yapılmadı**, bulgular `notes/pptx-pdf-libreoffice-chart-squish.md`'ye kaydedildi. (Ayrıca ilgisiz: `ga-report-bridge-server` GA4 çağrılarına geçici-hata retry + timeout eklendi.) 2026-07-26 — Analytica, `batchflow` hesabında genel GA4 event raporundan BatchFlow ürün hunisini (`demo_start`, `sign_up`, `render_success`, `purchase` vb.) üretir; MiniApps'e özel `app_id` eksikliği BatchFlow için ürün ölçümünü engellemez ve ürün event'leri key event sayısına yapay olarak yazılmaz. 2026-07-17 — Tek serili pozitif yatay PPTX bar chart'larda LibreOffice'in büyük dış etiketler yüzünden plot alanını sıkıştırması, dar koşullu ve fail-open normalizasyonla giderildi; negatif/stacked/çok serili/manual-layout grafikler kapsam dışı. 2026-07-17 — Image Converter, Image Resizer ve EXIF Cleaner üretim workspace'lerine, mevcut liste/ayarları koruyan ve yalnızca harici dosya drag'ini yakalayan sürükle-bırak eklendi; diğer uygulamalar kapsam dışında bırakıldı.
- **Bekleyen / sıradaki:** Helper `0.2.1` için push sonrası `windows-helpers.yml` gerçek Windows testi. Ayrıca video-to-audio/audio-editor canlı Windows Chrome doğrulaması yapılacak. Detay: `notes/ui-standardization-and-windows-test.md`.

## Çalışma tarzı (kullanıcı tercihleri)

- **Git commit/push/deploy:** yalnızca kullanıcı açıkça istediğinde veya görev net gerektirdiğinde. Varsayılan: kendiliğinden push/deploy etme. Yapınca sonucu bildir.
- Gereksiz dosya okuma yapma; sadece göreve ait olanı oku.
- `notes/` kalıcı karar deposu: önemli kararı yaz, stale notu sil.

## Dosya kapsamı

`AGENTS.md`/`CLAUDE.md` repo geneli geçerlidir. Daha spesifik bir alt klasörde
(ör. `qr-generator/AGENTS.md`) dosya olursa o klasördeki iş için **en yakın/spesifik olan baskın gelir.**
