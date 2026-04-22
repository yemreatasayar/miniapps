import type { ErrorCorrectionLevel, QrType, SavedQrDesign, WifiSecurity } from "./types";

function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function buildWifiPayload(
  ssid: string,
  password: string,
  security: WifiSecurity,
  hidden: boolean
): string {
  const parts = [
    "WIFI:",
    `T:${security};`,
    `S:${escapeWifiValue(ssid)};`,
    security === "nopass" ? "" : `P:${escapeWifiValue(password)};`,
    hidden ? "H:true;" : "",
    ";",
  ];

  return parts.join("");
}

function buildVCardPayload(draft: SavedQrDesign): string {
  const vcard = draft.fields.vcard;
  const fullName = [vcard.firstName, vcard.lastName].filter(Boolean).join(" ");

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcard.lastName};${vcard.firstName};;;`,
    `FN:${fullName}`,
    vcard.company ? `ORG:${vcard.company}` : "",
    vcard.title ? `TITLE:${vcard.title}` : "",
    vcard.phone ? `TEL;TYPE=CELL:${sanitizePhone(vcard.phone)}` : "",
    vcard.email ? `EMAIL:${vcard.email}` : "",
    vcard.website ? `URL:${vcard.website}` : "",
    vcard.address ? `ADR:;;${vcard.address};;;;` : "",
    vcard.note ? `NOTE:${vcard.note}` : "",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLocationPayload(draft: SavedQrDesign): string {
  const { latitude, longitude, address, mode } = draft.fields.location;

  if (mode === "maps" && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }

  return `geo:${latitude.trim()},${longitude.trim()}?q=${latitude.trim()},${longitude.trim()}(${encodeURIComponent(
    address.trim() || "Konum"
  )})`;
}

export function buildQrPayload(draft: SavedQrDesign): string {
  switch (draft.type) {
    case "url":
      return draft.fields.url.url.trim();
    case "wifi":
      return buildWifiPayload(
        draft.fields.wifi.ssid.trim(),
        draft.fields.wifi.password.trim(),
        draft.fields.wifi.security,
        draft.fields.wifi.hidden
      );
    case "vcard":
      return buildVCardPayload(draft);
    case "whatsapp": {
      const phone = sanitizePhone(draft.fields.whatsapp.phone);
      const message = draft.fields.whatsapp.message.trim();
      return `https://wa.me/${phone.replace(/^\+/, "")}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    }
    case "email": {
      const { to, subject, body } = draft.fields.email;
      const params = new URLSearchParams();
      if (subject.trim()) params.set("subject", subject.trim());
      if (body.trim()) params.set("body", body.trim());
      const query = params.toString();
      return `mailto:${to.trim()}${query ? `?${query}` : ""}`;
    }
    case "phone":
      return `tel:${sanitizePhone(draft.fields.phone.phone)}`;
    case "location":
      return buildLocationPayload(draft);
    case "text":
      return draft.fields.text.text;
    default:
      return "";
  }
}

function luminance(hex: string): number {
  const parsed = hex.replace("#", "");
  if (parsed.length < 6) return 0;

  const parts = [0, 2, 4].map((offset) => Number.parseInt(parsed.slice(offset, offset + 2), 16) / 255);
  const linearized = parts.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2];
}

function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function getQrWarnings(draft: SavedQrDesign): string[] {
  const warnings: string[] = [];
  const { foreground, background, transparentBackground, margin, errorCorrectionLevel, logoDataUrl, logoScale } = draft.design;

  if (!transparentBackground && contrastRatio(foreground, background) < 4) {
    warnings.push("QR foreground ve background renkleri birbirine fazla yakın; tarama zorlaşabilir.");
  }

  if (transparentBackground) {
    warnings.push("Şeffaf arka plan bazı yüzeylerde okunabilirliği düşürebilir.");
  }

  if (margin < 1) {
    warnings.push("Margin çok düşük; bazı okuyucular QR kodu çerçevesiz okumakta zorlanabilir.");
  }

  if (logoDataUrl && (errorCorrectionLevel === "L" || errorCorrectionLevel === "M")) {
    warnings.push("Logo eklerken hata düzeltme seviyesini Q veya H yapmak daha güvenlidir.");
  }

  if (logoDataUrl && logoScale > 24) {
    warnings.push("Logo boyutu yüksek; QR taranabilirliğini bozabilir.");
  }

  return warnings;
}

export function typeLabel(type: QrType): string {
  return {
    url: "Link",
    wifi: "Wi-Fi",
    vcard: "vCard",
    whatsapp: "WhatsApp",
    email: "E-posta",
    phone: "Telefon",
    location: "Konum",
    text: "Metin",
  }[type];
}

export function qrColorOptions(draft: SavedQrDesign): {
  width: number;
  margin: number;
  errorCorrectionLevel: ErrorCorrectionLevel;
  color: { dark: string; light: string };
} {
  return {
    width: draft.design.size,
    margin: draft.design.margin,
    errorCorrectionLevel: draft.design.errorCorrectionLevel,
    color: {
      dark: draft.design.foreground,
      light: draft.design.transparentBackground ? "#0000" : draft.design.background,
    },
  };
}
