# Stem Splitter Faz 2-4 Uygulama Plani

## Amac

Bu planin amaci, Faz 1'de tamamlanan helper-ready backend/frontend temelinin
ustuune kalan isi yarin dogrudan uygulanabilir gorev listesine cevirmektir.

Hedef:

- macOS helper paketini olusturmak
- web shell icinde `stem-splitter` kartini gorunur hale getirmek
- helper yok / warm-up / hazir akislarini canli sitede tamamlamak
- minimum smoke test ile MVP'yi kapatmak

Bu plan, `distribution/github-pages/STEM-HELPER-DESIGN.md` ile uyumludur.

---

## Scope Freeze

Yarin icin scope asagidaki gibi sabitlenir:

1. Yalnizca `macOS` helper paketi cikar.
2. `Windows` paketi yarina alinmaz.
3. Helper request auth hardening (`token / nonce`) yarina blocker degildir.
4. `Demucs` modeli paket icine gomulmez; ilk calistirmada indirilebilir.
5. Paket `unsigned` olabilir; notarization / codesign yarinlik scope'a dahil degil.
6. Canli origin hedefi `https://miniapps.tr` ve `https://www.miniapps.tr` kabul edilir.
7. Gecici olarak `https://yemreatasayar.github.io` origin'i de allowlist'te tutulur.

---

## Mimari Kararlari

### 1. Helper dagitim modeli

Tek delivery hedefi:

- `distribution/stem-helper-mac/`

Bu klasor build sonucu kullaniciya zip olarak verilecek helper paketi olur.

### 2. Kurulum hedefi

Kurulum script'i helper'i su klasore kurar:

```text
~/Library/Application Support/miniapps/stem-helper/
```

### 3. LaunchAgent konumu

```text
~/Library/LaunchAgents/com.miniapps.stem-helper.plist
```

### 4. Kurulu helper layout

Kurulum sonrasi nihai layout:

```text
~/Library/Application Support/miniapps/stem-helper/
├── runtime/
│   ├── app/
│   │   ├── server.mjs
│   │   ├── requirements.txt
│   │   ├── helper-config.template.json
│   │   └── helper-config.json
│   ├── node/
│   │   └── bin/node
│   ├── python/
│   │   └── bin/python3
│   └── ffmpeg/
│       └── bin/ffmpeg
└── logs/
```

### 5. Runtime sourcing stratejisi

Repo'ya buyuk binary commit edilmeyecek.

Bunun yerine packaging script'i runtime kaynaklarini explicit path/env ile alir:

- `MINIAPPS_STEM_HELPER_NODE_SRC`
- `MINIAPPS_STEM_HELPER_PYTHON_SRC`
- `MINIAPPS_STEM_HELPER_FFMPEG_SRC`

Boylece:

- packaging deterministic olur
- repo sismez
- yarin runtime binary sourcing bloklanirsa build script yine tamamlanabilir

### 6. Helper config stratejisi

Kurulum sirasinda `helper-config.template.json` uzerinden gercek
`helper-config.json` uretilir.

Allowlist varsayilani:

- `https://miniapps.tr`
- `https://www.miniapps.tr`
- `https://yemreatasayar.github.io`
- `http://127.0.0.1:4179`
- `http://localhost:4179`
- `http://127.0.0.1:4194`
- `http://localhost:4194`

### 7. Web indirme modeli

Canli sitede helper paketi tek bir statik asset olarak yayinlanir:

```text
distribution/github-pages/site/downloads/stem-helper-macos.zip
```

Frontend bu URL'e sabit degil, config/env tabanli bakar.

### 8. Klasor ayrimi notu

Iki benzer klasor bilincli olarak farkli amac tasir:

- `distribution/stem-helper/`: build script ve packaging automation
- `distribution/stem-helper-mac/`: kullaniciya verilecek paket icerigi

Bu ayrim kod duzeyinde korunur; scriptler bu iki klasoru birbirine
karistirmayacak sekilde isimlendirilir.

---

## Yarinin Uygulama Sirasi

Yarin uygulanacak sira:

1. Faz 2A - helper packaging iskeleti
2. Faz 2B - install/uninstall/launch agent
3. Faz 2C - packaging script ve zip cikisi
4. Faz 3A - web app download CTA ve helper-required ekranini tamamlama
5. Faz 3B - shell kartini gorunur yapma
6. Faz 3C - GitHub Pages build'e helper download artifact'i ekleme
7. Faz 4 - smoke test ve bug fix turu

Bu sirada ilerlemek dependency riskini en aza indirir.

---

## Faz 2 - macOS Helper Paketi

### Faz 2A - Paket iskeleti

Hedef dosyalar:

- `distribution/stem-helper-mac/`
- `distribution/stem-helper-mac/runtime/app/`
- `distribution/stem-helper-mac/runtime/app/helper-config.template.json`
- `distribution/stem-helper-mac/runtime/app/server.mjs`
- `distribution/stem-helper-mac/runtime/app/requirements.txt`

Yapilacaklar:

- `distribution/stem-helper-mac/` klasorunu olustur
- Faz 1 backend dosyalarini runtime/app altina kopyalayacak net yapiyi kur
- `helper-config.template.json` icine packaged path yapisini koy
- config template icine yeni custom domain origin'lerini ekle
- backend icin packaged layout'la uyumlu relatif pathleri sabitle

Done kriteri:

- helper package klasoru tek basina okunabilir ve anlasilir durumda olacak
- backend runtime dosyalari packaged layout'a gore resolve edebilecek

### Faz 2B - Installer ve LaunchAgent

Hedef dosyalar:

- `distribution/stem-helper-mac/Install Stem Helper.command`
- `distribution/stem-helper-mac/Uninstall Stem Helper.command`
- `distribution/stem-helper-mac/com.miniapps.stem-helper.plist.template`

Yapilacaklar:

- install script kurulum klasorunu olustursun
- runtime klasorlerini hedefe kopyalasin
- executable bit'leri ayarlasin
- `helper-config.template.json` -> `helper-config.json` uretsin
- LaunchAgent plist uretsin
- `launchctl bootstrap` veya uygun yukleme akisiyla agent'i kaydetsin
- `launchctl kickstart` ile helper'i baslatsin
- `http://127.0.0.1:4195/api/health` icin basit health check yapsin
- uninstall script agent'i kaldirsin ve kurulum klasorunu temizlesin

Done kriteri:

- install script temiz makinede helper'i ayaga kaldirabiliyor olmali
- uninstall script agent + runtime'i temizleyebilmeli

### Faz 2C - Packaging script

Hedef dosyalar:

- `distribution/stem-helper/build-stem-helper-mac.mjs`
- opsiyonel: `distribution/stem-helper/README.md`

Yapilacaklar:

- packaging script runtime source path'lerini env'den alsin
- backend app dosyalarini hedef pakete kopyalasin
- node/python/ffmpeg binary yerlesimini normalize etsin
- helper-config template'i kopyalasin
- final `stem-helper-macos.zip` uretsin

Done kriteri:

- tek komutla yeniden paket uretilebilmeli
- build script runtime source path verilmediginde anlamli hata vermeli

Faz 2 komut hedefi:

```bash
node distribution/stem-helper/build-stem-helper-mac.mjs
```

---

## Faz 3 - Web Entegrasyonu

### Faz 3A - Gercek helper-required ekrani

Hedef dosyalar:

- `stem-splitter/src/App.tsx`
- `stem-splitter/src/lib/api.ts`
- `stem-splitter/src/styles/global.css`

Yapilacaklar:

- helper yok ekranina gercek `macOS icin indir` CTA ekle
- `Windows yakinda` veya pasif secondary CTA ekle
- helper issue mesajlarini daha sade ve son kullanici dostu hale getir
- `install.platform` bilgisini UX'te kontrollu kullan
- custom domain altinda calisma icin health hata kopyalarini netlestir

Done kriteri:

- helper yoksa kullanici ne yapacagini tek ekranda anlar
- helper varsa dosya secme ve split akisi Faz 1 davranisiyla sorunsuz devam eder

### Faz 3B - Shell kartini gorunur yap

Hedef dosyalar:

- `distribution/github-pages/build-github-pages.mjs`
- gerekiyorsa `distribution/github-pages/PLAN.md`
- gerekiyorsa `distribution/github-pages/DEPLOYMENT.md`

Yapilacaklar:

- `stem-splitter` id'sini `hiddenAppIds` listesinden cikar
- gerekirse app card subtitle/secondary badge alanina `Local helper gerekli` metni ekle
- `visibleAppIds` icine `stem-splitter` ekle
- app launch URL'lerinin TR/EN icin dogru kaldigini kontrol et

Done kriteri:

- GitHub Pages shell'de `stem-splitter` karti gorunur olmali
- service worker logic hidden app varsayimina takilmamali

### Faz 3C - Download artifact yayinlama

Hedef dosyalar:

- `distribution/github-pages/build-github-pages.mjs`
- opsiyonel yeni klasor: `distribution/github-pages/downloads/`

Yapilacaklar:

- packaging script cikisini `distribution/github-pages/site/downloads/` altina kopyalayacak build adimi ekle
- frontend download URL'ini env/config ile okuyacak hale getir
- varsayilan URL `./downloads/stem-helper-macos.zip` olsun
- EN/TR app build'lerinde ayni asset path calissin
- `downloads/` klasorunu service worker cache listesi disinda tut
- buyuk helper zip dosyasinin offline app cache'ine girmedigini dogrula

Done kriteri:

- site build sonrasi helper zip tek bir sabit URL'de servis ediliyor olmali
- app icindeki `macOS icin indir` butonu bu artifact'e gitmeli
- service worker helper zip'i pre-cache veya app cache icine almamali

---

## Faz 4 - Smoke Test ve Kabul

### Faz 4A - Local install smoke test

Test adimlari:

1. mevcut helper kurulumu varsa uninstall et
2. yeni zip'i ac
3. `Install Stem Helper.command` calistir
4. `launchctl print gui/$(id -u)/com.miniapps.stem-helper` ile agent'i kontrol et
5. `curl http://127.0.0.1:4195/api/health` ile health kontrol et

Kabul:

- helper process ayakta
- health `ok: true` donuyor

### Faz 4B - Browser smoke test

Test adimlari:

1. `npm run build` ile `stem-splitter` build al
2. `node distribution/github-pages/build-github-pages.mjs` ile siteyi rebuild et
3. local preview veya canli custom domain altinda `stem-splitter` ac
4. helper yok / warm-up / ready senaryolarini sirayla test et

Kabul:

- helper yok ekraninda download CTA gorunur
- helper warm-up bitmeden split baslamaz
- helper hazir olunca split baslar

### Faz 4C - Gercek split testleri

Test dosya matrisi:

- kucuk mp3 (1-3 dk)
- orta wav (5-10 dk)
- buyuk dosya (limit altinda)

Kontroller:

- progress akisi guncelleniyor mu
- sonuc indirme linkleri calisiyor mu
- cancel akisi isliyor mu
- cleanup zamani sonunda job klasoru siliniyor mu

Kabul:

- en az bir kucuk ve bir orta dosya basariyla ayrilmali
- iptal edilen job cleanup olusturmali
- download sonrasi cleanup calismali

---

## Tam Gorev Listesi

Yarin yapilacak check-list:

- [ ] packaged helper klasor iskeletini olustur
- [ ] `helper-config.template.json` ekle
- [ ] custom domain origin'lerini helper config'e ekle
- [ ] install script yaz
- [ ] uninstall script yaz
- [ ] LaunchAgent template yaz
- [ ] packaging build script yaz
- [ ] zip cikisi uret
- [ ] web app'e gercek macOS download CTA ekle
- [ ] Windows CTA'yi pasif/coming soon yap
- [ ] shell'de `stem-splitter` kartini gorunur yap
- [ ] GitHub Pages build'e `downloads/` artifact kopyalama adimi ekle
- [ ] local install smoke test yap
- [ ] browser smoke test yap
- [ ] bir gercek split testi yap
- [ ] Faz 2-4 sonuc ozetini yeni markdown dosyasina yaz

---

## Dosya Bazli Calisma Haritasi

Yarin muhtemel degisecek dosyalar:

- `stem-splitter/backend/server.mjs`
- `stem-splitter/backend/helper-config.json`
- `stem-splitter/src/App.tsx`
- `stem-splitter/src/lib/api.ts`
- `stem-splitter/src/styles/global.css`
- `distribution/github-pages/build-github-pages.mjs`
- `distribution/github-pages/PLAN.md`
- `distribution/github-pages/DEPLOYMENT.md`
- `distribution/stem-helper/build-stem-helper-mac.mjs`
- `distribution/stem-helper-mac/Install Stem Helper.command`
- `distribution/stem-helper-mac/Uninstall Stem Helper.command`
- `distribution/stem-helper-mac/com.miniapps.stem-helper.plist.template`
- `distribution/stem-helper-mac/runtime/app/helper-config.template.json`

---

## Riskler ve Notlar

### 1. Runtime binary sourcing

En buyuk risk, yarin node/python/ffmpeg kaynak path'lerinin hazir olmamasi.

Cozum:

- packaging script'i bu path'leri env ile beklesin
- runtime binary sourcing ayri problem olsa bile packaging omurgasi bitirilsin

### 2. Gatekeeper / unsigned script

`Install Stem Helper.command` ilk calistirmada macOS uyarisi uretebilir.
Bu MVP icin kabul edilebilir.

### 3. Custom domain gecisi

Helper allowlist yarin kesin olarak:

- `https://miniapps.tr`
- `https://www.miniapps.tr`

degerlerini icermelidir.

### 4. Security hardening

`token / nonce` konusu takip listesinde kalir.
Yarinlik MVP blocker degildir ama Faz 2+ sonrasinda ilk sertlestirme maddesi
olmalidir.

---

## Yarin Baslangic Komut Seti

Yarina baslarken izlenecek minimum sirali komutlar:

```bash
cd /Users/yusufemreatasayar/miniapps

# 1. Stem helper package iskeleti ve build script
# 2. Frontend CTA + shell visibility
# 3. GitHub Pages rebuild

cd /Users/yusufemreatasayar/miniapps/stem-splitter
npm run build

cd /Users/yusufemreatasayar/miniapps
node distribution/github-pages/build-github-pages.mjs
```

Packaging komutu bu calismada eklenecek:

```bash
node distribution/stem-helper/build-stem-helper-mac.mjs
```

---

## Beklenen Cikis

Yarin gun sonunda beklenen cikti:

1. indirilebilir macOS helper zip
2. helper kurulum script'i
3. helper uninstall script'i
4. shell'de gorunen `stem-splitter` karti
5. app icinde gercek `macOS icin indir` akisi
6. local smoke test sonucu

Bu alti madde tamamlanirsa MVP, Faz 1'den gercek kullanilabilir dagitim
deneyimine gecmis olur.
