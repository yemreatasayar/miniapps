export type QrType = "url" | "wifi" | "vcard" | "whatsapp" | "email" | "phone" | "location" | "text";

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
export type WifiSecurity = "WPA" | "WEP" | "nopass";
export type LocationMode = "coordinates" | "maps";

export type UrlFields = {
  url: string;
};

export type WifiFields = {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
};

export type VCardFields = {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  note: string;
};

export type WhatsAppFields = {
  phone: string;
  message: string;
};

export type EmailFields = {
  to: string;
  subject: string;
  body: string;
};

export type PhoneFields = {
  phone: string;
};

export type LocationFields = {
  latitude: string;
  longitude: string;
  address: string;
  mode: LocationMode;
};

export type TextFields = {
  text: string;
};

export type QrFields = {
  url: UrlFields;
  wifi: WifiFields;
  vcard: VCardFields;
  whatsapp: WhatsAppFields;
  email: EmailFields;
  phone: PhoneFields;
  location: LocationFields;
  text: TextFields;
};

export type QrDesign = {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  margin: number;
  size: number;
  errorCorrectionLevel: ErrorCorrectionLevel;
  logoDataUrl: string | null;
  logoScale: number;
};

export type SavedQrDesign = {
  id: string;
  name: string;
  customerId?: string;
  type: QrType;
  fields: QrFields;
  design: QrDesign;
  updatedAt: string;
};
