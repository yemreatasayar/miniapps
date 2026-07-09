# Analytica - Calisma Sekli ve Veri Kapsami

Bu not, Analytica uygulamasini baska ajanlara veya danismanlara anlatmak icin hazirlandi. Amac; uygulamanin ne yaptigini, hangi verileri cektigini, hangi dosyalari urettigini ve hangi konularda fikir istenebilecegini tek yerde toplamak.

## Kisa Ozet

Analytica, Google Analytics 4 verilerini localde ceken, CSV olarak arsivleyen ve sade bir dashboard halinde gosteren bir MiniApps uygulamasidir.

Uygulama:

- GA4 property verilerini OAuth ile kullanicinin kendi Google hesabi uzerinden okur.
- Secili tarih araligi icin GA Data API sorgulari calistirir.
- Raporlari CSV dosyalari olarak local arsive yazar.
- Her sync icin `manifest.json` olusturur.
- Dashboard, rapor arsivi, veri durumu ve indirme ekranlari sunar.
- ZIP olarak toplu export verir.
- MiniApps shell icinden urun kullanim event'leri toplamaya baslamistir.

## Guncel Durum

- Analytica su anda local calisan bir aractir; `miniapps.tr` public siteye cikmaz.
- GA4 verisi `miniapps.tr` property id `534353758` uzerinden okunur.
- Local test ortamindan (`localhost`, `127.0.0.1`) urun event'i GA4'e gonderilmez.
- Public app sayfalari (`https://miniapps.tr/apps/...`) GA4 tag ve urun event wrapper'i icerir.
- DebugView testi URL parametresiyle yapilmaz; indexlenebilir test linki olusmamasi icin sadece tarayici `localStorage` flag'i kullanilir.
- Son bos sync dashboard'u sifirlamaz; dashboard son dolu arsivi gosterir ve veri durumu uyarisi verir.

## Kullanici Dili

UI dili Turkcedir. GA4 teknik terimleri daha anlasilir hale getirilmeye calisiliyor.

Terim kararlarindan bazilari:

- `users / active users` UI'da `Ziyaretciler` olarak gosterilir.
- `newUsers` UI'da `Yeni ziyaretciler` olarak gosterilir.
- `sessions` UI'da `Oturumlar` olarak kalir.
- `screenPageViews` UI'da `Goruntulemeler` olarak kalir.
- `keyEvents` UI'da `Onemli etkinlikler` olarak gosterilir.
- `Conversions / Donusumler` yerine `Onemli etkinlikler` tercih edilir.

Not: Kod ve CSV sozlesmesinde bazi teknik alanlar hala `users`, `newUsers`, `conversions` gibi isimlerle kalir. Bu bilincli bir ic sozlesme tercihidir.

## Ortam ve Yayin Ayrimi

Analytica iki parcadan olusur:

- Frontend app: `ga-report-bridge/`
- Local helper API: `ga-report-bridge-server/`

Bu iki klasor su anda local gelistirme/kullanim icindir. Public MiniApps build'ine dahil edilmemelidir.

MiniApps public app'leri ise GA4 event gonderir:

- `https://miniapps.tr/apps/<appId>/`
- `https://miniapps.tr/apps-en/<appId>/`

Local app sayfalari event gondermez:

- `http://localhost:...`
- `http://127.0.0.1:...`

Bu guard bilincli olarak kondu; local testlerin GA4 verisini kirletmesini engeller.

## Ana Bilesenler

Frontend:

- `ga-report-bridge/`
- Ana dosyalar: `ga-report-bridge/src/App.tsx`, `ga-report-bridge/src/styles/global.css`
- Sayfalar: `Genel Bakis`, `Raporlar`, `Ayarlar`

Local helper / backend:

- `ga-report-bridge-server/`
- Ana dosyalar: `ga-report-bridge-server/server.mjs`, `ga-report-bridge-server/report-definitions.mjs`
- Helper portu: `127.0.0.1:4187`

Backend gorevleri:

- OAuth Desktop App akisini yonetmek.
- GA Data API client olusturmak.
- GA4 property metadata okumak.
- Rapor tanimlarini calistirmak.
- Compatibility kontrolu yapmak.
- CSV dosyalari yazmak.
- Manifest yazmak.
- Sync history donmek.
- Dashboard summary uretmek.
- Tekil CSV veya ZIP export vermek.
- Otomatik gunluk sync calistirmak.

## Auth Modeli

Ilk mimari service account JSON dusunulmustu, fakat Google Cloud organization policy sebebiyle service account key creation engeline takildi. Daha sonra OAuth Desktop App mimarisine gecildi.

Mevcut model:

- Google Cloud projesinde OAuth Desktop App client olusturulur.
- Indirilen `client_secret_...json` dosyasi uygulama ayarlarindan secilir.
- Helper dosyayi local `.data/oauth-client.json` olarak saklar.
- Kullanici ilk baglantida Google hesabi ile izin verir.
- Token local `.data/oauth-token.json` icinde saklanir.
- Scope su anda analytics read-only odaklidir.

Risk notu:

- Token su anda local dosyada tutuluyor.
- macOS Keychain gibi daha guvenli saklama henuz eklenmedi.
- Drive/Docs scope'lari henuz eklenmedi; eklenirse risk seviyesi artar.

## Local Veri Dizini

Varsayilan local data dizini:

- `.data/`

Icerik:

- `.data/config.json`
- `.data/oauth-client.json`
- `.data/oauth-token.json`
- `.data/index.json`
- `.data/property-metadata-cache.json`
- `.data/scheduler-state.json`
- `.data/reports/<accountId>/<archiveDate>/*.csv`
- `.data/reports/<accountId>/<archiveDate>/manifest.json`

`.data/` git'e alinmaz.

## Rapor Tanimlari

Rapor tanimlari merkezi dosyada tutulur:

- `ga-report-bridge-server/report-definitions.mjs`

Her rapor tanimi su alanlari icerir:

- `id`
- `displayName`
- `description`
- `filename`
- `dimensions`
- `metrics`
- `ordering`
- `filters`
- `optional`
- `category`
- `dashboardVisibility`

Mevcut raporlar:

| ID | Dosya | Kategori | Amac |
| --- | --- | --- | --- |
| `overview_daily` | `overview_daily.csv` | overview | Gunluk KPI trendi |
| `traffic_channels` | `traffic_channels.csv` | traffic | Kanal bazli trafik |
| `source_medium` | `source_medium.csv` | traffic | Kaynak / medium |
| `referral_urls` | `referral_urls.csv` | traffic | Yonlendiren URL'ler |
| `referral_keywords` | `referral_keywords.csv` | traffic | Referral / kampanya terimleri |
| `landing_pages` | `landing_pages.csv` | content | Acilis sayfalari |
| `pages` | `pages.csv` | content | Sayfa performansi |
| `events` | `events.csv` | events | Etkinlik ozeti |
| `tool_usage` | `tool_usage.csv` | product | MiniApps urun kullanim event'leri |
| `geo` | `geo.csv` | audience | Ulke / sehir |
| `device_browser` | `device_browser.csv` | audience | Cihaz ve tarayici |

## Metrik Esleme Notu

GA4 tarafinda guncel metrik `keyEvents` kullanilir. Fakat mevcut CSV ve frontend sozlesmesini bozmamak icin output adi `conversions` olarak korunur.

Ornek:

```js
{ name: "keyEvents", output: "conversions" }
```

UI'da bu alan `Onemli etkinlikler` olarak gosterilir.

## Sync Akisi

Manuel sync:

- Frontend `POST /api/sync` cagirir.
- Body:

```json
{
  "accountId": "miniapps",
  "startDate": "7daysAgo",
  "endDate": "yesterday"
}
```

`Bugun` seciliyken:

```json
{
  "accountId": "miniapps",
  "startDate": "today",
  "endDate": "today"
}
```

Gunluk raporlama icin varsayilan davranis `yesterday` bitislidir. Bunun sebebi GA4 verilerinin gun icinde gecikmeli veya oynak olabilmesidir.

### Tarih Araligi Notlari

UI'da tarih araligi secimi sync istegini etkiler:

- `Bugun`: `today -> today`
- `Dun`: `yesterday -> yesterday`
- `7 Gun`: `7daysAgo -> yesterday`
- `30 Gun`: `30daysAgo -> yesterday`
- `Bu Ay`: simdilik `30daysAgo -> yesterday`

GA4 ayni gun verisinde gecikmeli davranabilir. Bu yuzden `Bugun` sync'i bazen 0 satir dondurebilir.

### Bos Sync Fallback'i

Onemli karar:

- Sync basarili olsa bile GA4 tum raporlari 0 satir dondurebilir.
- Ozellikle `today -> today` araliginda bu durum goruldu.
- Boyle bir bos sync `.data/reports/<accountId>/<archiveDate>/` altina yine arsivlenir.
- Ancak dashboard ana veri kaynagi olarak bos sync'i kullanmaz.
- Dashboard, `overview_daily.csv` icinde en az bir veri satiri bulunan son arsivi secer.
- Son sync bos, onceki sync doluysa dashboard son dolu arsivi gosterir.
- `dataStatus.warning` icinde su mantikla uyari doner:

```text
Son senkronizasyon (YYYY-MM-DD) bos veri dondurdu; dashboard son dolu arsivden (YYYY-MM-DD) gosteriliyor.
```

Bu karar, kullanicinin tekrar "Verileri Guncelle" demesiyle dashboard'un aniden sifirlanmasini engeller.

Otomatik sync:

- Helper icinde basit bir zamanlayici vardir.
- Varsayilan saat: `23:55`
- Varsayilan aralik: `7daysAgo -> yesterday`
- Tum kayitli hesaplar icin calisir.
- Durum `.data/scheduler-state.json` icinde tutulur.
- `/api/health` icinde `autoSync` ve `scheduler` bilgisi doner.

## Compatibility ve Metadata

Her sync oncesinde:

- Property metadata okunur.
- Kullanilabilir dimensions ve metrics listesi alinir.
- Rapor tanimlari compatibility kontrolunden gecer.
- Uyumsuzluk varsa rapor sessizce kaybolmaz; manifest icinde warning/error olarak isaretlenir.

Manifest icinde saklanan kalite bilgileri:

- timezone
- currency
- thresholding
- sampling
- data loss from other row
- quota
- warnings
- errors
- report status counts

## Dashboard Verileri

Ana KPI'lar:

- Oturumlar
- Ziyaretciler
- Goruntulemeler
- Onemli etkinlikler

Ikincil KPI'lar:

- Yeni ziyaretciler
- Etkilesim orani
- Ortalama etkilesim suresi
- Oturum basina onemli etkinlik orani

Ek alanlar:

- Performans akisi
- Trafik kanallari
- En iyi acilis sayfalari
- En cok goruntulenen sayfalar
- Tekil ziyaretci
- Cogul hit
- Referral keyword
- Referral URL
- Arac kullanimi

### Dashboard Kaynak Secimi

Dashboard summary `index.json` icindeki raporlardan uretilir. Eski davranista en yeni tarih klasoru her zaman ana kaynak seciliyordu. Bu, bos `today` sync'i geldigi zaman KPI'lari 0'a dusuruyordu.

Guncel davranis:

- Once hesaba ait tum report date'ler yeni -> eski siralanir.
- Her tarih icin `overview_daily.csv` okunur.
- Veri satiri olan en yeni tarih `latestDate` kabul edilir.
- Bos en yeni tarih varsa `latestAttemptDate` olarak not edilir ama dashboard'u ezmez.
- Onceki donem karsilastirmasi icin veri satiri olan bir onceki tarih tercih edilir.

### Onemli Etkinlikler ve Arac Kullanimi Farki

`Onemli etkinlikler` karti GA4 Data API'deki `keyEvents` metrigine dayanir. Kod ve CSV sozlesmesinde bu alan `conversions` olarak kalir.

`Arac kullanimi` karti ise ham urun event'lerinden beslenir:

- `process_success`
- `process_error`
- `export_download`
- `repeat_use`
- `favorite_add`
- `favorite_remove`
- `tool_open`

Bu nedenle su durum normaldir:

- `Arac kullanimi` dolu olabilir.
- `Onemli etkinlikler` 0 kalabilir.

Sebep genelde GA4 tarafinda `process_success` event'inin key event olarak isaretlenmemis olmasi, key event verisinin gecikmesi veya ilgili tarih araliginda key event metrigine henuz yansimamasi olabilir.

Fallback:

- `keyEvents` 0 donerse ve `process_success` ham event'i varsa, dashboard KPI icinde `Onemli etkinlikler` icin `process_success` sayisi kullanilir.
- Bu fallback UI'nin tamamen bos gorunmesini engeller.

## MiniApps Urun Event Akisi

MiniApps public app'leri ortak event wrapper'i kullanir.

Ortak parametreler:

- `app_id`
- `app_version`
- `shell_version`
- `source`
- `page_language`

Ana event'ler:

- `tool_open`
- `process_success`
- `process_error`
- `export_download`
- `repeat_use`

Public app'lerde event gonderimi vardir. Local app'lerde yoktur.

DebugView testi icin URL parametresi kullanilmaz. Public URL'lerin temiz ve indexlenebilir olmayan test varyantlarina bolunmemesi icin debug flag sadece localStorage ile acilir.

Debug acma:

```js
localStorage.setItem("miniapps.gaDebug", "1")
```

Debug kapatma:

```js
localStorage.removeItem("miniapps.gaDebug")
```

Debug acikken normal public URL kullanilir:

```text
https://miniapps.tr/apps/qr-generator/
```

Bu durumda event payload'ina `debug_mode: true` eklenir. Normal kullanicilar etkilenmez.

Event standardinin detaylari:

- `notes/miniapps-event-taxonomy.md`

## Endpointler

Helper endpointleri:

- `GET /api/health`
- `GET /api/config`
- `POST /api/config`
- `GET /api/auth/start?returnTo=...`
- `GET /api/auth/callback`
- `GET /api/accounts`
- `POST /api/sync`
- `GET /api/reports`
- `GET /api/sync-history`
- `GET /api/dashboard?accountId=...`
- `GET /api/export?id=...`
- `GET /api/export-bundle?accountId=...`

## Export Ciktilari

Tekil CSV:

- `/api/export?id=<reportId>`

Toplu ZIP:

- `/api/export-bundle?accountId=<accountId>`
- `/api/export-bundle?accountId=<accountId>&date=<archiveDate>`

ZIP icinde:

- Secili CSV dosyalari
- `manifest.json`
- `index.md`

## Bilinen Davranislar ve Tuzaklar

- `Bugun` sync'i GA4 gecikmesi nedeniyle 0 donebilir.
- Bos sync arsivde kalir ama dashboard son dolu arsive duser.
- Local testler GA4'e gitmez; canli event testi `miniapps.tr` uzerinden yapilmalidir.
- DebugView icin `localStorage` flag'i gerekir; yalnizca normal Realtime raporda gorunmesi DebugView'a dusmesi anlamina gelmez.
- `process_success` DebugView'da gorunse bile key event metrigine yansimasi gecikebilir.
- GA4 custom dimension'lar kaydedilmeden onceki event parametreleri geriye donuk app bazli raporlanmaz.
- `.data/` local ve hassastir; token ve OAuth client dosyalari git'e alinmaz.
- Analytica app'i public siteye dahil edilmemelidir.

## Baska Ajanlardan Fikir Istenebilecek Konular

- GA4 `today` verisi icin daha dogru tazelik stratejisi: realtime endpoint, today partial label'i veya sadece yesterday default.
- Bos sync arsivlerinin UI'da nasil gosterilecegi: rapor kasasinda "bos veri" badge'i, dashboard uyarisi, tekrar dene aksiyonu.
- `keyEvents` ve `process_success` fallback'inin UI'da nasil anlatilacagi.
- OAuth token saklama icin macOS Keychain entegrasyonu.
- Rapor setinin genisletilmesi: retention, funnel, path exploration benzeri ama Data API uyumlu raporlar.
- MiniApps urun event taxonomy'sinde yeni event gerekip gerekmedigi.

## Mevcut Guclu Yanlar

- OAuth Desktop App ile service account key riskinden kaciniliyor.
- Rapor tanimlari merkezi config dosyasinda.
- GA metadata ve compatibility kontrolu var.
- Batch report calistirma ve fallback var.
- Manifest ve sync history altyapisi var.
- ZIP export manifest ile birlikte geliyor.
- Dashboard mock data yerine gercek local CSV arsivinden besleniyor.
- Dusuk veri hacmi uyarisi var.
- Referral URL ve keyword raporlari eklendi.
- Otomatik gunluk sync baslatildi.
- Bos sync dashboard'u sifirlamiyor; son dolu arsive fallback var.
- Public MiniApps app'lerinde urun event wrapper'i yayildi.

## Bilinen Sinirlar

- OAuth token local dosyada saklaniyor; Keychain entegrasyonu yok.
- `Bugun` verisi GA tarafinda gun icinde gecikmeli veya eksik olabilir.
- Otomatik sync helper calisir durumdayken devrededir; OS-level launch/cron garanti katmani ayrica dusunulebilir.
- Favori ekleme/cikarma event'leri shell akisi netlestikce tamamlanacak.
- `tool_usage.csv` app bazli dolmak icin GA4 custom dimension `app_id` kaydina ihtiyac duyar.
- Drive/Docs entegrasyonu henuz yok.
- UI tarafinda son piksel polish devam ediyor.
- GA thresholding/sampling genellikle manifestte yakalaniyor ama dashboard yorum katmani henuz cok derin degil.

## Fikir Istenebilecek Konular

1. Dashboard'daki KPI isimleri ve aciklamalari yeterince net mi?
2. `Ziyaretci`, `Oturum`, `Goruntuleme`, `Onemli etkinlik` terminolojisi dogru mu?
3. Hangi GA4 raporlari eksik?
4. MiniApps urun kullanimini olcmek icin hangi event taxonomy daha iyi olur?
5. CSV export yapisi yapay zeka araclarina atmak icin yeterince temiz mi?
6. Manifest icinde hangi veri kalitesi alanlari eklenmeli?
7. Otomatik sync icin en dogru zamanlama ve retry stratejisi ne olmali?
8. Token saklama icin local dosya yeterli mi, macOS Keychain'e gecilmeli mi?
9. Dashboard'da dusuk veri hacmi ve onceki donem karsilastirmalari nasil anlatilmali?
10. Rapor arsivi haftalik/aylik paketleri nasil uretmeli?

## Ilgili Notlar

- `notes/miniapps-event-taxonomy.md`
- `ga-report-bridge-server/report-definitions.mjs`
- `ga-report-bridge-server/server.mjs`

## Kisa Degerlendirme

Analytica su an calisan bir local GA4 rapor koprusu durumunda. Temel islevleri:

- Baglan
- Sync et
- CSV uret
- Arsivle
- Dashboard goster
- Rapor indir

Bir sonraki buyuk deger artisi, GA4 tarafindaki custom dimension ve key event kurulumunu tamamlayip `tool_usage.csv` verisini daha guvenilir hale getirmek olur. Boylece Analytica sadece site trafigini degil, araclarin gercek kullanimini de anlamli sekilde gosterebilir.

## Tuzaklar (Landmine) - Tarih Araligi ve Veri Dizini

Bu bolum 2026-06-16'da yasanan bir bug ve cozumunden cikti. Ikisi de koddan kolay anlasilmiyor.

### 1. Dashboard tek bir "en guncel arsivi" gosterir; aralik butonlari frontend filtresidir

- Her sync, `archiveDate = bugunun tarihi` anahtariyla **tek bir arsiv** yazar (`syncAccount`). Ayni gun icindeki her sync ayni slotu **ezer**.
- `buildDashboardSummary` her zaman **yalnizca en guncel (date'e gore en yeni) arsivi** kaynak alir.
- UI'daki Bugun/Dun/7 Gun/30 Gun butonlari backend'e yeni sorgu **atmaz**; `dataForRange` mevcut arsivin gunluk trendini suzer/dilimler.

Sonuc: Gosterilen pencere, **son sync'in cektigi tarih araligina** baglidir. Bu yuzden **sync HER ZAMAN genis pencere** olmali: `startDate: "60daysAgo", endDate: "today"`.

- **2026-06-20: pencere 30 -> 60 gune cikarildi.** Sebep: "Onceki donemle karsilastir" gercek bir onceki-30-gun ile karsilastirilabilsin (30 Gun current = son 30 gun, onceki = ondan onceki 30 gun -> 60 gun gecmis gerekir). 30 gun pencerede onceki-donem yoktu; eski kod onun yerine **onceki sync'in 29 gun ortusen arsivini** kullaniyordu -> tum karsilastirmalar ~%0 ("degismedi") cikiyordu.
- `handleSync` (frontend) ve gecelik auto-sync (`runAutoSyncIfDue`, server.mjs) artik sabit `60daysAgo..today` senkronlar; secili aralik gonderilmez.
- `dataForRange`: 7d=son 7 gun, 30d=son 30 gun dilimi; today/yesterday/month gun filtresi. **Onceki donem = AYNI surekli trend'in hemen onceki N gunluk penceresi** (`trend.slice(start-N, start)`), onceki sync arsivi DEGIL. Gecmis yetersizse basa bos gun eklenip hizalanir.
- **Dar bir sync (today/yesterday) dashboard'u zehirler** -> arsiv 1 gune coker -> 7 Gun/Dun **0** gorunur. Bir daha "secili arali ile sync et" tasarimina donme.

### 3. KPI fallback'i GLOBAL toplama dusurmek (2026-06-20 fix)

`Onemli etkinlikler` ve `Yeni ziyaretciler` kartlari, secili araligin dilimlenmis degeri 0 olunca **tum-arsiv global toplamina** (`toolUsage.metrics.success` / `.newUsers`) dusuyordu. Sonuc: Dun gibi dar araliklarda gercek 0 yerine global sayi (19 / 59) basiliyor, **alt kume (1 gun) > ust kume (30 gun)** paradoksu olusuyordu (ust ustelik `process_success` eventCount=19, keyEvents=15'ten farkli metrik). Fix: frontend'deki `|| currentData.toolUsage.metrics.*` fallback'leri kaldirildi; sadece range-dilimlenmis `currentData.kpi.*` kullanilir. Bos-arsiv (keyEvents=0, process_success>0) fallback'i zaten server'da arsiv genelinde trend'e isleniyor, korunur. Ayrica iki sparkline yanlis metrigi ciziyordu (Yeni ziyaretci->users, Ort. sure->sessions); duzeltildi.

### 2. Helper'in veri dizini: proje kokune sabitlendi

- Canli veri (config + oauth-token + 30 gunluk arsivler) `/Users/yusufemreatasayar/miniapps/.data` icinde.
- Helper `DATA_DIR` varsayilanini `ga-report-bridge-server/../.data` olarak hesaplar. Bu nedenle hangi calisma klasorunden baslarsa baslasin **bos** `ga-report-bridge-server/.data`'ya dusmez.
- Eskiden app yalnizca **elle (miniapps kokunden) baslatilmis bir orphan helper** sayesinde calisiyordu; bu kirilgandi.
- `local-runtime/launcher-config.json` icindeki `MINIAPPS_GA_BRIDGE_DATA_DIR` ayari ek bir koruma katmanidir; launcher uzerinden baslatma da ayni depoyu kullanir.

### Helper'i yeniden baslatma (server.mjs degisince)

Launcher helper beklenmedik bicimde kapanirsa 1.5 saniye sonra otomatik yeniden baslatir. Tum launcher'in yeniden baslatilmasi gerekirse dogru yol:
1. `local-runtime/bin/node-macos-arm64 launcher.mjs stop` (child'lari da kapatir, PID dosyasini temizler)
2. 4187 hala doluysa kalan helper PID'sini kill et (orphan olabilir)
3. `launchctl kickstart -k gui/$(id -u)/com.miniapps.launcher` (launchd uzerinden kalici, detached baslatir)
4. `curl 127.0.0.1:4187/api/health` -> `dataDir`, `accounts`, `authorized` dogrula
