# Analytica Helper

Yerel GA4 rapor deposu ve Google Analytics Data API köprüsü.

## Google tarafı

1. Google Cloud Console'da bir proje oluştur.
2. `Google Analytics Data API` servisini etkinleştir.
3. `Google Auth Platform` icinde `Clients` ekranina gir.
4. `Create Client` -> `Application type: Desktop app` ile bir OAuth client olustur.
5. Indirdigin client JSON dosyasini guvenli bir yerde sakla.
6. Uygulamayi ilk kez baglarken tarayicida GA4 erisimi olan Google hesabinla izin ver.

## Yerel config

Helper ilk çalıştığında `ga-report-bridge-server/.data/config.json` oluşturur.

Örnek:

```json
{
  "oauthClientPath": "/Users/you/secure/google-oauth-client.json",
  "accounts": [
    {
      "id": "miniapps",
      "name": "miniapps.tr",
      "propertyId": "123456789",
      "siteUrl": "miniapps.tr"
    }
  ]
}
```

`oauthClientPath` repo disinda guvenli bir yerde olmali. Client JSON dosyasini git'e ekleme.
OAuth izni tamamlandiginda helper `ga-report-bridge-server/.data/oauth-token.json` dosyasini olusturur.

## Endpointler

- `GET /api/health`
- `GET /api/config`
- `GET /api/auth/start?returnTo=...`
- `GET /api/auth/callback`
- `POST /api/config`
- `GET /api/accounts`
- `POST /api/sync`
- `GET /api/reports`
- `GET /api/dashboard?accountId=...`
- `GET /api/export?id=...`
- `GET /api/export-bundle?accountId=...`

`/api/dashboard` en guncel sync klasorundeki `overview_daily.csv`, `traffic_channels.csv` ve
`landing_pages.csv` dosyalarini okuyup dashboard icin hazir ozet JSON dondurur.
