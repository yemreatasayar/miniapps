# Weekly Bulletin Studio

Lokal calisan mini app. Amaç:
- 1080 px genisliginde tek uzun bulten tasarimi olusturmak
- Excel'den haberleri cekmek
- Gorselleri birebir dosya adi ile eslestirmek
- Tiklanabilir link annotation iceren tek uzun PDF export vermek

## Calistirma

```bash
cd /Users/yusufemreatasayar/miniapps/weekly-bulletin
npm install
npm run dev
```

Varsayilan adres: [http://127.0.0.1:4178](http://127.0.0.1:4178)

## Ozellikler

- Manuel haber ekleme, silme ve surukle-birak siralama
- Toplu gorsel yukleme
- Excel import (`.xlsx`, `.xls`, `.csv`)
- `image_name` ile birebir gorsel eslestirme
- IndexedDB tabanli taslak ve gecmis kayitlari
- Programatik PDF export
- PDF icinde gercek tiklanabilir link alanlari

## Excel Sutunlari

Beklenen sutunlar:

```text
title
summary
source
author
date
link
image_name
```

Ornek dosya: `/Users/yusufemreatasayar/miniapps/weekly-bulletin/samples/weekly-bulletin-template.xlsx`

## Ornek Ciktilar

- Ornek Excel: `/Users/yusufemreatasayar/miniapps/weekly-bulletin/samples/weekly-bulletin-template.xlsx`
- Ornek PDF: `/Users/yusufemreatasayar/miniapps/weekly-bulletin/samples/sample-export.pdf`
- Ornek gorseller: `/Users/yusufemreatasayar/miniapps/weekly-bulletin/samples/images`

## Notlar

- Browser print akisi kullanilmaz.
- PDF tek sayfa, ozel boyutlu ve uzun formatta uretilir.
- Gorseller raster olabilir, ama link alanlari PDF annotation olarak gercek baglanti seklinde eklenir.
