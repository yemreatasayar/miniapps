# MiniApps Event Taxonomy v1

Bu dokuman, MiniApps shell ve app'lerinden GA4'e gonderilecek urun kullanim event'lerinin standardini tanimlar. Amac; Analytica dashboard'undaki `Onemli etkinlikler` ve `Arac kullanimi` kartlarini gercek veriyle beslemek ve tum app'lerde tutarli olcum saglamaktir.

Durum: v1 - kesinlesti, pilot entegrasyon basladi.

## Tasarim Ilkeleri

1. Az event, cok disiplinli parametre. Yeni davranis = yeni event degil; once mevcut bir event'in parametresiyle ifade edilip edilemeyecegine bakilir.
2. Her event'te ortak parametre seti zorunludur. Parametresiz event gonderimi kabul edilmez.
3. Event ve parametre adlari `snake_case`, GA4 limitlerine uygun olmalidir.
4. `app_id` degerleri merkezi bir listeden gelir; serbest metin yazilmaz.
5. Olcum once 2-3 pilot app'te dogrulanir, sonra yayilir.

## Ortak Parametreler

Tum event'lerde zorunlu parametreler:

| Parametre | Tip | Ornek | Aciklama |
| --- | --- | --- | --- |
| `app_id` | string | `json-formatter` | App'in sabit slug'i. |
| `app_version` | string | `1.4.0` | App'in semver versiyonu. |
| `shell_version` | string | `2026.2.1` | MiniApps shell versiyonu. |
| `source` | string | `home_grid` | Event'in nereden tetiklendigi. |
| `page_language` | string | `tr` | Site dili. Izinli degerler: `tr`, `en`. |

`source` icin izinli degerler:

- `home_grid`
- `search`
- `favorite`
- `recent`
- `deeplink`
- `internal`

## Event Tanimlari

### `tool_open`

Bir app'in acilmasi. Shell tarafindan gonderilir.

Ek parametre:

- `is_first_open`: Bu tarayicida app'in ilk acilisi mi?

Not: `tool_open` key event olarak isaretlenmez.

### `process_success`

App'in ana isini basariyla tamamlamasi. Taxonomy'nin en degerli event'idir.

Ek parametreler:

- `process_type`: App icindeki islem turu. Zorunlu.
- `duration_ms`: Islem suresi. Opsiyonel.
- `input_size_kb`: Yaklasik girdi boyutu. Opsiyonel.

Kural: Kullanici acisindan "is tamamlandi" anlamina gelen tek bir an secilir ve sadece orada atilir.

### `process_error`

Ana islemin kullaniciya gorunur sekilde basarisiz olmasi.

Ek parametreler:

- `process_type`: `process_success` ile ayni sozluk. Zorunlu.
- `error_code`: Kisa, sabit hata kodu. Zorunlu.
- `error_stage`: Hatanin olustugu asama. Opsiyonel.

Baslangic `error_code` sozlugu:

- `invalid_input`
- `too_large`
- `unsupported_format`
- `timeout`
- `internal`

Serbest hata mesaji GA4'e gonderilmez.

### `export_download`

Kullanicinin uretilen ciktiyi indirmesi veya panoya almasi.

Ek parametreler:

- `export_format`: `csv`, `png`, `zip`, `clipboard` gibi cikti formati. Zorunlu.
- `file_count`: Coklu dosya / ZIP durumunda dosya sayisi. Opsiyonel.

### `repeat_use`

Ayni oturumda ayni app'te ikinci ve sonraki basarili islemler.

Ek parametre:

- `run_index`: Oturum icindeki kacinci basarili calistirma. Zorunlu, `2`den baslar.

### `favorite_add` / `favorite_remove`

Favorilere ekleme ve cikarma. Shell tarafindan gonderilir. Ortak parametre seti yeterlidir.

## GA4 Konfigurasyonu

Key event yap:

- `process_success`

Opsiyonel key event:

- `export_download`

Key event yapma:

- `tool_open`
- `page_view`
- `favorite_add`
- `favorite_remove`

Data API'de sorgulamak icin event-scoped custom dimension olarak kaydedilecek parametreler:

1. `app_id`
2. `process_type`
3. `source`
4. `error_code`
5. `export_format`
6. `page_language`

Not: Kayit anindan onceki veriler custom dimension olarak geriye donuk gorunmez.

## Analytica Raporu

Analytica tarafinda `tool_usage.csv` raporu uretilir.

Beklenen alanlar:

- `eventName`
- `appId`
- `eventCount`
- `users`

Bu rapor opsiyoneldir. `customEvent:app_id` ilgili property'de custom dimension olarak kaydedilmediyse compatibility mekanizmasi raporu `unavailable` olarak isaretler.

## Gonderim Katmani

App'lerin `gtag`i dogrudan cagirmasi yerine shell tek bir wrapper sunmalidir:

```js
trackAppEvent("process_success", {
  process_type: "format",
  duration_ms: 420,
});
```

Wrapper sorumluluklari:

- Ortak parametreleri otomatik doldurmak.
- Izinli event listesi disindaki adlari reddetmek.
- `source` ve `page_language` degerlerini normalize etmek.
- Dev ortaminda GA4 DebugView icin `debug_mode` ekleyebilmek.

## Yayilim Plani

1. Shell `tool_open` event'ini taxonomy ortak parametreleriyle uyumlu hale getir. Tamamlandi.
2. 2 pilot app'te `process_success`, `process_error`, `export_download`, `repeat_use` event'lerini dene. Basladi: `qr-generator`, `csv-toolkit`.
3. GA4 custom dimension kayitlarini olustur.
4. GA4 DebugView ve Analytica `tool_usage.csv` ile veri dogrula.
5. `process_success` event'ini GA4'te key event olarak isaretle.
6. `favorite_add/remove` event'lerini shell'e ekle. Not: Shell'de favori UI/akisi netlesince yapilacak.
7. Event wrapper'i kalan app'lere yay.

## Pilot Entegrasyon

12 Haziran 2026 itibariyla:

- `miniapps/src/App.tsx` local shell `tool_open` event'ine taxonomy ortak parametrelerini ekler.
- `miniapps/src/DistributionApp.tsx` public shell `tool_open` event'ine taxonomy ortak parametrelerini ekler.
- `qr-generator` app'i `process_success`, `process_error`, `export_download`, `repeat_use` event'lerini gonderir.
- `csv-toolkit` app'i `process_success`, `process_error`, `export_download`, `repeat_use` event'lerini gonderir.
- `ga-report-bridge-server/report-definitions.mjs` icinde `tool_usage` raporu tanimlidir.
- `ga-report-bridge-server/server.mjs` `tool_usage.csv` varsa dashboard `Arac kullanimi` kartini app bazli besler.

## GA4'te Elle Yapilacaklar

Analytica'nin `tool_usage.csv` raporunun app bazli dolmasi icin GA4 Admin tarafinda su event-scoped custom dimension'lar kaydedilmeli:

- `app_id`
- `process_type`
- `source`
- `error_code`
- `export_format`
- `page_language`

`process_success` key event olarak isaretlenmeli. `tool_open`, `page_view`, `favorite_add`, `favorite_remove` key event yapilmamali.

## Karar Kaydi

12 Haziran 2026:

- `repeat_use` ayri event olarak kalir.
- `duration_ms` ve `input_size_kb` simdilik parametre olarak toplanir; custom metric kaydi daha sonra ihtiyaca gore yapilir.
- `page_language` ortak parametre setine eklenir.
