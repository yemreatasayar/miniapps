import type { QrDesign, QrFields, QrType, SavedQrDesign } from "./types";

export const qrTypeMeta: Array<{ type: QrType; label: string; hint: string }> = [
  { type: "url", label: "Link", hint: "Web adresi" },
  { type: "wifi", label: "Wi-Fi", hint: "Ağ bilgisi" },
  { type: "vcard", label: "vCard", hint: "Kişi kartı" },
  { type: "whatsapp", label: "WhatsApp", hint: "Mesaj linki" },
  { type: "email", label: "E-posta", hint: "Mail oluştur" },
  { type: "phone", label: "Telefon", hint: "Ara" },
  { type: "location", label: "Konum", hint: "Harita / geo" },
  { type: "text", label: "Metin", hint: "Düz içerik" },
];

export const defaultFields: QrFields = {
  url: { url: "" },
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  vcard: {
    firstName: "",
    lastName: "",
    company: "",
    title: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    note: "",
  },
  whatsapp: {
    phone: "",
    message: "",
  },
  email: {
    to: "",
    subject: "",
    body: "",
  },
  phone: {
    phone: "",
  },
  location: {
    latitude: "",
    longitude: "",
    address: "",
    mode: "coordinates",
  },
  text: {
    text: "",
  },
};

const exampleFields: QrFields = {
  url: { url: "https://www.mmo.org.tr" },
  wifi: { ssid: "MMO-Guest", password: "", security: "WPA", hidden: false },
  vcard: {
    firstName: "Yusuf Emre",
    lastName: "Atasayar",
    company: "miniapps",
    title: "Kurucu",
    phone: "+905551112233",
    email: "hello@example.com",
    website: "https://example.com",
    address: "İstanbul, Türkiye",
    note: "QR ile hızlı iletişim kartı",
  },
  whatsapp: {
    phone: "+905551112233",
    message: "Merhaba, QR üzerinden ulaşıyorum.",
  },
  email: {
    to: "hello@example.com",
    subject: "QR Üzerinden Mesaj",
    body: "Merhaba, bu e-postayı QR kod üzerinden başlatıyorum.",
  },
  phone: {
    phone: "+902122223344",
  },
  location: {
    latitude: "41.015137",
    longitude: "28.979530",
    address: "İstanbul",
    mode: "coordinates",
  },
  text: {
    text: "Miniapps QR Generator lokal çalışan bir araçtır.",
  },
};

export const defaultDesign: QrDesign = {
  foreground: "#111111",
  background: "#ffffff",
  transparentBackground: false,
  margin: 2,
  size: 1080,
  errorCorrectionLevel: "M",
  logoDataUrl: null,
  logoScale: 18,
};

export function createNewDraft(type: QrType = "url"): SavedQrDesign {
  return {
    id: crypto.randomUUID(),
    name: "",
    type,
    fields: JSON.parse(JSON.stringify(defaultFields)) as QrFields,
    design: { ...defaultDesign },
    updatedAt: new Date().toISOString(),
  };
}

export const exampleHistory: SavedQrDesign[] = [
  {
    ...createNewDraft("url"),
    id: "example-url",
    name: "MMO Link QR",
    fields: {
      ...JSON.parse(JSON.stringify(exampleFields)),
      url: { url: exampleFields.url.url },
    },
    updatedAt: "2026-04-11T08:15:00.000Z",
  },
  {
    ...createNewDraft("wifi"),
    id: "example-wifi",
    name: "Misafir Wi-Fi",
    fields: {
      ...JSON.parse(JSON.stringify(exampleFields)),
      wifi: { ...exampleFields.wifi },
    },
    updatedAt: "2026-04-10T18:40:00.000Z",
  },
  {
    ...createNewDraft("vcard"),
    id: "example-vcard",
    name: "İletişim Kartı",
    fields: {
      ...JSON.parse(JSON.stringify(exampleFields)),
      vcard: { ...exampleFields.vcard },
    },
    updatedAt: "2026-04-09T14:25:00.000Z",
  },
];
