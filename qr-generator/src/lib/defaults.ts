import type { QrDesign, QrFields, QrType, SavedQrDesign } from "./types";

export const qrTypeMeta: Array<{ type: QrType; label: string; hint: string }> = [
  { type: "url", label: "Link", hint: "Web adresi" },
  { type: "wifi", label: "Wi-Fi", hint: "Ağ bilgisi" },
  { type: "vcard", label: "vCard", hint: "Kişi kartı" },
  { type: "whatsapp", label: "WhatsApp", hint: "Mesaj linki" },
  { type: "email", label: "E-posta", hint: "Mail hazırla" },
  { type: "phone", label: "Telefon", hint: "Ara" },
  { type: "location", label: "Konum", hint: "Harita / geo" },
  { type: "text", label: "Metin", hint: "Düz metin" },
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

// İlk kez giren kullanıcı boş geçmişle başlar; örnek/örnek-dışı veri gösterilmez.
export const exampleHistory: SavedQrDesign[] = [];
