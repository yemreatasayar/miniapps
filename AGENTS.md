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
- **Public footer (`.distribution-header`) sabit konumlu** (`position: fixed; bottom: 0`); yüksekliği `--distribution-footer-height` CSS değişkeniyle workspace'e boşluk olarak rezerve edilir. Footer içeriğini değiştirince (satır ekle/çıkar) bu değişkeni **her breakpoint'te** (980/760/560px) güncelle, yoksa alt grid'de boşluk/üst üste binme olur. Mobilde (≤760px) sürüm metni (`.distribution-version` = "miniapps pack … by y.e.a.") `display:none` ile gizli; Manifesto + TR/ENG butonları küçültülmüş.

## Güncel durum

- Local + web stabil.
- **Son değişiklikler** (tarihli, son birkaçı tut): 2026-07-01 — `video-compressor` Segment Yönetimi'ne 5 adımlık Geri Al / İleri Al eklendi ve `miniapps.tr`'ye `ef33694c` ile gönderildi.
- **Bekleyen / sıradaki:** —

## Çalışma tarzı (kullanıcı tercihleri)

- **Git commit/push/deploy:** yalnızca kullanıcı açıkça istediğinde veya görev net gerektirdiğinde. Varsayılan: kendiliğinden push/deploy etme. Yapınca sonucu bildir.
- Gereksiz dosya okuma yapma; sadece göreve ait olanı oku.
- `notes/` kalıcı karar deposu: önemli kararı yaz, stale notu sil.

## Dosya kapsamı

`AGENTS.md`/`CLAUDE.md` repo geneli geçerlidir. Daha spesifik bir alt klasörde
(ör. `qr-generator/AGENTS.md`) dosya olursa o klasördeki iş için **en yakın/spesifik olan baskın gelir.**
