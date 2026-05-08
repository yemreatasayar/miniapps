import { ChangeEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createNewDraft, qrTypeMeta } from "./lib/defaults";
import { buildQrPayload, getQrWarnings, qrColorOptions, typeLabel } from "./lib/qr";
import { clearDraft, clearHistory, loadDraft, loadHistory, saveDraft, saveHistory } from "./lib/storage";
import type {
  ErrorCorrectionLevel,
  LocationMode,
  QrType,
  SavedQrDesign,
  WifiSecurity,
} from "./lib/types";

type ExportFormat = "png" | "svg" | "pdf";
const PDF_POINTS_PER_INCH = 72;
const MIN_LOGO_DPI = 300;
const PREVIEW_SIZE = 320;
const logoUrl = `${import.meta.env.BASE_URL}assets/qr-generator-logo.svg`;
const isDistribution = window.location.hostname === "miniapps.tr";
const EXPORT_SIZE_OPTIONS = [
  { value: 520, label: "520 × 520 px" },
  { value: 1080, label: "1080 × 1080 px" },
  { value: 2048, label: "2048 × 2048 px" },
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function wrapSvgWithLogo(svgMarkup: string, draft: SavedQrDesign, pixelExportSize: number): Promise<string> {
  if (!draft.design.logoDataUrl) return svgMarkup;

  // qrcode kütüphanesi viewBox'ı modül birimiyle üretir (ör. "0 0 29 29"),
  // width/height attribute'u ise piksel değerdir. Logo koordinatları viewBox
  // uzayında hesaplanmalı; yoksa logo görünmez.
  const parser = new DOMParser();
  const qrDoc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const qrSvgEl = qrDoc.documentElement as unknown as SVGSVGElement;
  const { width: coordSize } = getSvgViewBoxMetrics(qrSvgEl);

  const logoSize = (coordSize * draft.design.logoScale) / 100;
  const logoPosition = (coordSize - logoSize) / 2;
  const safePad = logoSize * 0.18;
  const safeRectSize = logoSize + safePad * 2;
  const safeRectPosition = logoPosition - safePad;
  const vectorLogoLayer = buildVectorLogoLayer(draft.design.logoDataUrl, logoSize, logoPosition);
  // Raster logolar için gerçek piksel boyutunu kullan; viewBox birimi küçük olduğundan
  // DPI hesabı piksel export boyutuna göre yapılmalı.
  const pixelLogoSize = Math.round((pixelExportSize * draft.design.logoScale) / 100);
  const embeddedLogoSource = vectorLogoLayer
    ? null
    : await createHighResolutionLogoDataUrl(
        draft.design.logoDataUrl,
        pixelLogoSize,
        MIN_LOGO_DPI
      );
  const rasterLogoLayer = `
    <image
      href="${embeddedLogoSource}"
      x="${logoPosition}"
      y="${logoPosition}"
      width="${logoSize}"
      height="${logoSize}"
      preserveAspectRatio="xMidYMid meet"
    />
  `;
  const logoLayer = `
    <rect
      x="${safeRectPosition}"
      y="${safeRectPosition}"
      width="${safeRectSize}"
      height="${safeRectSize}"
      rx="${Math.round(safeRectSize * 0.18)}"
      fill="white"
    />
    ${vectorLogoLayer ?? rasterLogoLayer}
  `;

  return svgMarkup.replace("</svg>", `${logoLayer}</svg>`);
}

function getContainedRect(boxSize: number, sourceWidth: number, sourceHeight: number): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: boxSize,
      height: boxSize,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const scale = Math.min(boxSize / sourceWidth, boxSize / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  return {
    width,
    height,
    offsetX: Math.round((boxSize - width) / 2),
    offsetY: Math.round((boxSize - height) / 2),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const safeHex = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized.padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

function loadImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = source;
  });
}

function decodeSvgDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/svg\+xml(?:(;charset=[^;,]+)?(;base64)?)?,(.*)$/i);
  if (!match) return null;

  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";

  try {
    return isBase64 ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function getSvgViewBoxMetrics(svgElement: SVGSVGElement): { minX: number; minY: number; width: number; height: number } {
  const viewBox = svgElement.getAttribute("viewBox");
  if (viewBox) {
    const [minX, minY, width, height] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));

    if ([minX, minY, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0) {
      return { minX, minY, width, height };
    }
  }

  const widthAttr = Number.parseFloat(svgElement.getAttribute("width") ?? "");
  const heightAttr = Number.parseFloat(svgElement.getAttribute("height") ?? "");

  return {
    minX: 0,
    minY: 0,
    width: widthAttr > 0 ? widthAttr : 100,
    height: heightAttr > 0 ? heightAttr : 100,
  };
}

function sanitizeSvgElement(svgElement: SVGSVGElement): void {
  svgElement.querySelectorAll("script, foreignObject").forEach((node) => node.remove());

  svgElement.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
      }

      if ((name === "href" || name === "xlink:href") && value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });
}

function buildVectorLogoLayer(logoDataUrl: string, logoSize: number, logoPosition: number): string | null {
  const svgMarkup = decodeSvgDataUrl(logoDataUrl);
  if (!svgMarkup) return null;

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svgElement = documentNode.documentElement as unknown as SVGSVGElement;

  if (!svgElement || svgElement.tagName.toLowerCase() !== "svg") {
    return null;
  }

  sanitizeSvgElement(svgElement);

  const { minX, minY, width, height } = getSvgViewBoxMetrics(svgElement);
  const contained = getContainedRect(logoSize, width, height);
  const nestedX = logoPosition + contained.offsetX;
  const nestedY = logoPosition + contained.offsetY;
  const scaleX = contained.width / width;
  const scaleY = contained.height / height;

  return `
    <g transform="translate(${nestedX} ${nestedY})">
      <g transform="scale(${scaleX} ${scaleY})">
        <g transform="translate(${-minX} ${-minY})">
          ${svgElement.innerHTML}
        </g>
      </g>
    </g>
  `;
}

async function createHighResolutionLogoDataUrl(
  logoDataUrl: string,
  displaySizeInPoints: number,
  minimumDpi = MIN_LOGO_DPI
): Promise<string> {
  const logoImage = await loadImageElement(logoDataUrl);
  const rasterSize = Math.max(
    Math.ceil((displaySizeInPoints * minimumDpi) / PDF_POINTS_PER_INCH),
    Math.ceil(displaySizeInPoints)
  );

  const canvas = document.createElement("canvas");
  canvas.width = rasterSize;
  canvas.height = rasterSize;

  const context = canvas.getContext("2d");
  if (!context) return logoDataUrl;

  const containedLogo = getContainedRect(rasterSize, logoImage.naturalWidth, logoImage.naturalHeight);
  context.clearRect(0, 0, rasterSize, rasterSize);
  context.drawImage(
    logoImage,
    containedLogo.offsetX,
    containedLogo.offsetY,
    containedLogo.width,
    containedLogo.height
  );

  return canvas.toDataURL("image/png");
}

async function composePngDataUrl(draft: SavedQrDesign, exportSize: number): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(buildQrPayload(draft), {
    ...qrColorOptions(draft),
    width: exportSize,
  });

  if (!draft.design.logoDataUrl) return qrDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = exportSize;
  canvas.height = exportSize;
  const context = canvas.getContext("2d");
  if (!context) return qrDataUrl;

  const [qrImage, logoImage] = await Promise.all([
    loadImageElement(qrDataUrl),
    loadImageElement(draft.design.logoDataUrl),
  ]);

  context.clearRect(0, 0, exportSize, exportSize);
  if (!draft.design.transparentBackground) {
    context.fillStyle = draft.design.background;
    context.fillRect(0, 0, exportSize, exportSize);
  }

  context.drawImage(qrImage, 0, 0, exportSize, exportSize);

  const logoSize = Math.round((exportSize * draft.design.logoScale) / 100);
  const logoPosition = Math.round((exportSize - logoSize) / 2);
  const safePad = Math.round(logoSize * 0.18);
  const safeRectSize = logoSize + safePad * 2;
  const safeRectPosition = logoPosition - safePad;
  const containedLogo = getContainedRect(logoSize, logoImage.naturalWidth, logoImage.naturalHeight);

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.roundRect(
    safeRectPosition,
    safeRectPosition,
    safeRectSize,
    safeRectSize,
    Math.round(safeRectSize * 0.18)
  );
  context.fill();
  context.drawImage(
    logoImage,
    logoPosition + containedLogo.offsetX,
    logoPosition + containedLogo.offsetY,
    containedLogo.width,
    containedLogo.height
  );

  return canvas.toDataURL("image/png");
}

async function composeVectorPdf(draft: SavedQrDesign, payload: string, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pageSize = draft.design.size;
  const qrBoxOffset = Math.round(pageSize * (40 / 520));
  const qrBoxSize = pageSize - qrBoxOffset * 2;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [pageSize, pageSize],
  });
  const qr = QRCode.create(payload, {
    errorCorrectionLevel: draft.design.errorCorrectionLevel,
  });
  const moduleCount = qr.modules.size;
  const quietZone = Math.max(0, draft.design.margin);
  const totalUnits = moduleCount + quietZone * 2;
  const moduleSize = qrBoxSize / totalUnits;
  const foreground = hexToRgb(draft.design.foreground);
  const background = hexToRgb(draft.design.background);

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageSize, pageSize, "F");

  if (!draft.design.transparentBackground) {
    pdf.setFillColor(background.r, background.g, background.b);
    pdf.rect(qrBoxOffset, qrBoxOffset, qrBoxSize, qrBoxSize, "F");
  }

  pdf.setFillColor(foreground.r, foreground.g, foreground.b);

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      const index = row * moduleCount + column;
      if (!qr.modules.data[index]) continue;

      const x = qrBoxOffset + (quietZone + column) * moduleSize;
      const y = qrBoxOffset + (quietZone + row) * moduleSize;
      pdf.rect(x, y, moduleSize, moduleSize, "F");
    }
  }

  if (draft.design.logoDataUrl) {
    const logoSize = Math.round((qrBoxSize * draft.design.logoScale) / 100);
    const logoPosition = Math.round(qrBoxOffset + (qrBoxSize - logoSize) / 2);
    const safePad = Math.round(logoSize * 0.18);
    const safeRectSize = logoSize + safePad * 2;
    const safeRectPosition = logoPosition - safePad;
    const exportLogoDpi = Math.max(MIN_LOGO_DPI, Math.round(MIN_LOGO_DPI * draft.design.size / 1080));
    const highResLogoDataUrl = await createHighResolutionLogoDataUrl(draft.design.logoDataUrl, logoSize, exportLogoDpi);

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(
      safeRectPosition,
      safeRectPosition,
      safeRectSize,
      safeRectSize,
      Math.round(safeRectSize * 0.18),
      Math.round(safeRectSize * 0.18),
      "F"
    );
    pdf.addImage(
      highResLogoDataUrl,
      "PNG",
      logoPosition,
      logoPosition,
      logoSize,
      logoSize
    );
  }

  pdf.save(filename);
}

function App() {
  const customerScope = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const customerId = searchParams.get("customerId")?.trim() || "global";
    const customerName = searchParams.get("customerName")?.trim() || "Genel";
    const customerCity = searchParams.get("customerCity")?.trim() || "Bağımsız kullanım";

    return {
      customerId,
      customerName,
      customerCity,
    };
  }, []);
  const [draft, setDraft] = useState<SavedQrDesign>(() => {
    const loaded = loadDraft({ customerId: customerScope.customerId });
    // Eski localStorage kayıtlarında size, dropdown seçenekleriyle eşleşmeyebilir; normalize et.
    if (!EXPORT_SIZE_OPTIONS.some((o) => o.value === loaded.design.size)) {
      return { ...loaded, design: { ...loaded.design, size: 1080 } };
    }
    return loaded;
  });
  const [history, setHistory] = useState<SavedQrDesign[]>(() => loadHistory({ customerId: customerScope.customerId }));
  const [svgMarkup, setSvgMarkup] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportError, setExportError] = useState<string | null>(null);

  const payload = useMemo(() => buildQrPayload(draft), [draft]);
  const warnings = useMemo(() => getQrWarnings(draft), [draft]);
  const currentTypeMeta = useMemo(() => qrTypeMeta.find((item) => item.type === draft.type), [draft.type]);
  const previewLogoSize = useMemo(
    () => Math.round((PREVIEW_SIZE * draft.design.logoScale) / 100),
    [draft.design.logoScale]
  );
  const previewLogoSafeSize = useMemo(
    () => previewLogoSize + Math.round(previewLogoSize * 0.36),
    [previewLogoSize]
  );

  useEffect(() => {
    saveDraft({ customerId: customerScope.customerId }, draft);
  }, [customerScope.customerId, draft]);

  useEffect(() => {
    saveHistory({ customerId: customerScope.customerId }, history);
  }, [customerScope.customerId, history]);

  useEffect(() => {
    let cancelled = false;

    async function renderPreview() {
      try {
        const previewSvg = await QRCode.toString(payload || " ", {
          ...qrColorOptions(draft),
          width: PREVIEW_SIZE,
          type: "svg",
        });
        if (!cancelled) {
          setSvgMarkup(previewSvg);
        }
      } catch {
        if (!cancelled) {
          setSvgMarkup("");
        }
      }
    }

    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [draft, payload]);

  function patchDraft(nextDraft: SavedQrDesign): void {
    setDraft({ ...nextDraft, updatedAt: new Date().toISOString() });
  }

  function updateType(type: QrType): void {
    patchDraft({
      ...draft,
      type,
    });
  }

  function updateName(name: string): void {
    patchDraft({ ...draft, name });
  }

  function updateField<T extends keyof SavedQrDesign["fields"]>(
    section: T,
    patch: Partial<SavedQrDesign["fields"][T]>
  ): void {
    patchDraft({
      ...draft,
      fields: {
        ...draft.fields,
        [section]: {
          ...draft.fields[section],
          ...patch,
        },
      },
    });
  }

  function updateDesign<K extends keyof SavedQrDesign["design"]>(key: K, value: SavedQrDesign["design"][K]): void {
    patchDraft({
      ...draft,
      design: {
        ...draft.design,
        [key]: value,
      },
    });
  }

  function handleNewQr(): void {
    setDraft(createNewDraft());
  }

  function handleReset(): void {
    const resetDraft = createNewDraft(draft.type);
    setDraft({
      ...resetDraft,
      id: draft.id,
      name: draft.name,
    });
  }

  function handleSave(): void {
    const existingRecord = history.find((item) => item.id === draft.id);
    const shouldCreateNewRecord = existingRecord
      ? existingRecord.name !== draft.name || existingRecord.type !== draft.type
      : false;

    const nextSaved = {
      ...draft,
      customerId: customerScope.customerId,
      id: shouldCreateNewRecord ? crypto.randomUUID() : draft.id,
      updatedAt: new Date().toISOString(),
    };

    setHistory((current) => {
      const exists = current.some((item) => item.id === nextSaved.id);
      const nextHistory = exists
        ? current.map((item) => (item.id === nextSaved.id ? nextSaved : item))
        : [nextSaved, ...current];

      return [...nextHistory].sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt));
    });
    setDraft(nextSaved);
  }

  function handleOpenHistory(saved: SavedQrDesign): void {
    const size = EXPORT_SIZE_OPTIONS.some((o) => o.value === saved.design.size) ? saved.design.size : 1080;
    setDraft({ ...saved, design: { ...saved.design, size } });
  }

  function handleDeleteHistory(id: string): void {
    setHistory((current) => current.filter((item) => item.id !== id));
  }

  function handleClearHistory(): void {
    setHistory([]);
    clearHistory({ customerId: customerScope.customerId });
    clearDraft({ customerId: customerScope.customerId });
    setDraft(createNewDraft(draft.type));
  }

  async function handleExport(): Promise<void> {
    if (!payload.trim()) {
      return;
    }

    setExportError(null);
    const baseName = (draft.name || "qr-generator").toLowerCase().replace(/\s+/g, "-");

    try {
      if (exportFormat === "svg") {
        const exportSize = draft.design.size;
        const svg = await QRCode.toString(payload, {
          ...qrColorOptions(draft),
          width: exportSize,
          type: "svg",
        });
        const wrappedSvg = await wrapSvgWithLogo(svg, draft, exportSize);
        downloadBlob(`${baseName}.svg`, new Blob([wrappedSvg], { type: "image/svg+xml;charset=utf-8" }));
      }

      if (exportFormat === "png") {
        const pngUrl = await composePngDataUrl(draft, draft.design.size);
        const response = await fetch(pngUrl);
        const blob = await response.blob();
        downloadBlob(`${baseName}.png`, blob);
      }

      if (exportFormat === "pdf") {
        await composeVectorPdf(draft, payload, `${baseName}.pdf`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[export error]", error);
      setExportError(message);
    }
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Logo okunamadı."));
      reader.readAsDataURL(file);
    });

    updateDesign("logoDataUrl", dataUrl);
  }

  function renderTypeFields() {
    switch (draft.type) {
      case "url":
        return (
          <label className="field">
            <span>URL</span>
            <input
              value={draft.fields.url.url}
              onChange={(event) => updateField("url", { url: event.target.value })}
              placeholder="https://..."
            />
          </label>
        );
      case "wifi":
        return (
          <>
            <label className="field">
              <span>SSID</span>
              <input
                value={draft.fields.wifi.ssid}
                onChange={(event) => updateField("wifi", { ssid: event.target.value })}
                placeholder="Ağ adı"
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Şifre</span>
                <input
                  value={draft.fields.wifi.password}
                  onChange={(event) => updateField("wifi", { password: event.target.value })}
                  placeholder="Şifre"
                />
              </label>
              <label className="field">
                <span>Güvenlik</span>
                <select
                  value={draft.fields.wifi.security}
                  onChange={(event) => updateField("wifi", { security: event.target.value as WifiSecurity })}
                >
                  <option value="WPA">WPA</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Şifresiz</option>
                </select>
              </label>
            </div>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={draft.fields.wifi.hidden}
                onChange={(event) => updateField("wifi", { hidden: event.target.checked })}
              />
              <span>Gizli ağ</span>
            </label>
          </>
        );
      case "vcard":
        return (
          <>
            <div className="field-grid">
              <label className="field">
                <span>Ad</span>
                <input
                  value={draft.fields.vcard.firstName}
                  onChange={(event) => updateField("vcard", { firstName: event.target.value })}
                  placeholder="Ad"
                />
              </label>
              <label className="field">
                <span>Soyad</span>
                <input
                  value={draft.fields.vcard.lastName}
                  onChange={(event) => updateField("vcard", { lastName: event.target.value })}
                  placeholder="Soyad"
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Şirket</span>
                <input
                  value={draft.fields.vcard.company}
                  onChange={(event) => updateField("vcard", { company: event.target.value })}
                  placeholder="Şirket"
                />
              </label>
              <label className="field">
                <span>Unvan</span>
                <input
                  value={draft.fields.vcard.title}
                  onChange={(event) => updateField("vcard", { title: event.target.value })}
                  placeholder="Unvan"
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Telefon</span>
                <input
                  value={draft.fields.vcard.phone}
                  onChange={(event) => updateField("vcard", { phone: event.target.value })}
                  placeholder="+90..."
                />
              </label>
              <label className="field">
                <span>E-posta</span>
                <input
                  value={draft.fields.vcard.email}
                  onChange={(event) => updateField("vcard", { email: event.target.value })}
                  placeholder="mail@example.com"
                />
              </label>
            </div>
            <label className="field">
              <span>Website</span>
              <input
                value={draft.fields.vcard.website}
                onChange={(event) => updateField("vcard", { website: event.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field">
              <span>Adres</span>
              <textarea
                value={draft.fields.vcard.address}
                onChange={(event) => updateField("vcard", { address: event.target.value })}
                placeholder="Adres"
              />
            </label>
            <label className="field">
              <span>Not</span>
              <textarea
                value={draft.fields.vcard.note}
                onChange={(event) => updateField("vcard", { note: event.target.value })}
                placeholder="Ek not"
              />
            </label>
          </>
        );
      case "whatsapp":
        return (
          <>
            <label className="field">
              <span>Telefon Numarası</span>
              <input
                value={draft.fields.whatsapp.phone}
                onChange={(event) => updateField("whatsapp", { phone: event.target.value })}
                placeholder="+90..."
              />
            </label>
            <label className="field">
              <span>Hazır Mesaj</span>
              <textarea
                value={draft.fields.whatsapp.message}
                onChange={(event) => updateField("whatsapp", { message: event.target.value })}
                placeholder="Mesaj"
              />
            </label>
          </>
        );
      case "email":
        return (
          <>
            <label className="field">
              <span>Alıcı</span>
              <input
                value={draft.fields.email.to}
                onChange={(event) => updateField("email", { to: event.target.value })}
                placeholder="mail@example.com"
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Konu</span>
                <input
                  value={draft.fields.email.subject}
                  onChange={(event) => updateField("email", { subject: event.target.value })}
                  placeholder="Konu"
                />
              </label>
              <label className="field">
                <span>Mesaj</span>
                <textarea
                  value={draft.fields.email.body}
                  onChange={(event) => updateField("email", { body: event.target.value })}
                  placeholder="Mail gövdesi"
                />
              </label>
            </div>
          </>
        );
      case "phone":
        return (
          <label className="field">
            <span>Telefon Numarası</span>
            <input
              value={draft.fields.phone.phone}
              onChange={(event) => updateField("phone", { phone: event.target.value })}
              placeholder="+90..."
            />
          </label>
        );
      case "location":
        return (
          <>
            <label className="field">
              <span>Konum Türü</span>
              <select
                value={draft.fields.location.mode}
                onChange={(event) => updateField("location", { mode: event.target.value as LocationMode })}
              >
                <option value="coordinates">Koordinat</option>
                <option value="maps">Harita Araması</option>
              </select>
            </label>
            {draft.fields.location.mode === "coordinates" ? (
              <div className="field-grid">
                <label className="field">
                  <span>Latitude</span>
                  <input
                    value={draft.fields.location.latitude}
                    onChange={(event) => updateField("location", { latitude: event.target.value })}
                    placeholder="41.015137"
                  />
                </label>
                <label className="field">
                  <span>Longitude</span>
                  <input
                    value={draft.fields.location.longitude}
                    onChange={(event) => updateField("location", { longitude: event.target.value })}
                    placeholder="28.979530"
                  />
                </label>
              </div>
            ) : null}
            <label className="field">
              <span>Adres / Harita Linki</span>
              <textarea
                value={draft.fields.location.address}
                onChange={(event) => updateField("location", { address: event.target.value })}
                placeholder="Adres veya arama terimi"
              />
            </label>
          </>
        );
      case "text":
        return (
          <label className="field">
            <span>Metin</span>
            <textarea
              value={draft.fields.text.text}
              onChange={(event) => updateField("text", { text: event.target.value })}
              placeholder="Düz metin"
            />
          </label>
        );
      default:
        return null;
    }
  }

  return (
    <>
    <main className="qr-shell">
      <section className="editor-column">
        <header className="hero-card">
          <div className="hero-main">
            <div className="hero-brand">
        <img className="hero-logo" src={logoUrl} alt="QR Oluşturucu" />
            </div>
            <div className="hero-side">
              {customerScope.customerId !== "global" && (
                <div className="customer-pill-row">
                  <span className="customer-pill">{customerScope.customerName}</span>
                  <span className="customer-pill customer-pill-muted">{customerScope.customerCity}</span>
                </div>
              )}
              <div className="action-row hero-actions">
                <button type="button" className="primary-action" onClick={handleNewQr}>
                  Yeni QR
                </button>
                <button type="button" className="secondary-action" onClick={handleSave}>
                  Kaydet
                </button>
                <button type="button" className="secondary-action" onClick={handleReset}>
                  Temizle
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="editor-card">
          <div className="section-header">
            <div>
              <h2>QR Türü</h2>
              <p>{currentTypeMeta?.hint}</p>
            </div>
          </div>

          <div className="type-grid">
            {qrTypeMeta.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`type-chip ${draft.type === item.type ? "is-active" : ""}`}
                onClick={() => updateType(item.type)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>

          <div className="field-stack">
            <label className="field">
              <span>Tasarım Adı</span>
              <input value={draft.name} onChange={(event) => updateName(event.target.value)} placeholder="QR adı" />
            </label>
            {renderTypeFields()}
          </div>
        </section>

        <section className="editor-card">
          <div className="section-header">
            <div>
              <h2>Stil Ayarları</h2>
              <p>Renk, margin, boyut ve export güvenliği</p>
            </div>
          </div>

          <div className="field-grid compact-grid">
            <label className="field">
              <span>QR Rengi</span>
              <input
                type="color"
                value={draft.design.foreground}
                onChange={(event) => updateDesign("foreground", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Arka Plan</span>
              <input
                type="color"
                value={draft.design.background}
                onChange={(event) => updateDesign("background", event.target.value)}
                disabled={draft.design.transparentBackground}
              />
            </label>
            <label className="field">
              <span>Boyut</span>
              <select
                value={draft.design.size}
                onChange={(event) => updateDesign("size", Number(event.target.value))}
              >
                {EXPORT_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Margin</span>
              <input
                type="number"
                min={0}
                max={8}
                value={draft.design.margin}
                onChange={(event) => updateDesign("margin", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Hata Düzeltme</span>
              <select
                value={draft.design.errorCorrectionLevel}
                onChange={(event) =>
                  updateDesign("errorCorrectionLevel", event.target.value as ErrorCorrectionLevel)
                }
              >
                <option value="L">L</option>
                <option value="M">M</option>
                <option value="Q">Q</option>
                <option value="H">H</option>
              </select>
            </label>
            <label className="field">
              <span>Logo Boyutu %</span>
              <input
                type="number"
                min={12}
                max={28}
                value={draft.design.logoScale}
                onChange={(event) => updateDesign("logoScale", Number(event.target.value))}
              />
            </label>
          </div>

          <div className="inline-actions">
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={draft.design.transparentBackground}
                onChange={(event) => updateDesign("transparentBackground", event.target.checked)}
              />
              <span>Şeffaf Arka Plan</span>
            </label>

            <label className="upload-chip">
              <input type="file" accept="image/*" onChange={handleLogoUpload} />
              <span>Logo Ekle</span>
            </label>

            {draft.design.logoDataUrl ? (
              <button type="button" className="ghost-action" onClick={() => updateDesign("logoDataUrl", null)}>
                Logoyu Kaldır
              </button>
            ) : null}
          </div>

          {warnings.length > 0 ? (
            <div className="warning-list">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="editor-card">
          <div className="section-header">
            <div>
              <h2>Geçmiş Tasarımlar</h2>
            </div>
            <button type="button" className="ghost-action danger-text" onClick={handleClearHistory}>
              Geçmişi Temizle
            </button>
          </div>

          {history.length === 0 ? (
            <div className="history-empty">
              <strong>Henüz kayıt yok.</strong>
              <p>Eski tasarımlarını bu alandan görebilirsin.</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <article key={item.id} className="history-item">
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {typeLabel(item.type)} · {formatDate(item.updatedAt)}
                    </span>
                  </div>
                  <div className="history-actions">
                    <button type="button" className="ghost-action" onClick={() => handleOpenHistory(item)}>
                      Aç
                    </button>
                    <button type="button" className="ghost-action danger-text" onClick={() => handleDeleteHistory(item.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <aside className="preview-column">
        <section className="preview-card">
          <div className="section-header">
            <div>
              <h2>Canlı Preview</h2>
              <p>{typeLabel(draft.type)} QR</p>
            </div>
            <div className="export-controls">
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
                <option value="pdf">PDF</option>
              </select>
              <button type="button" className="primary-action" onClick={handleExport}>
                İndir
              </button>
            </div>
            {exportError && (
              <p className="export-error">{exportError}</p>
            )}
          </div>

          <div className="preview-stage">
            <div
              className={`qr-artboard ${draft.design.transparentBackground ? "is-transparent" : ""}`}
              style={
                {
                  "--qr-size": `${PREVIEW_SIZE}px`,
                  "--qr-background": draft.design.transparentBackground ? "transparent" : draft.design.background,
                  "--qr-logo-safe-size": `${previewLogoSafeSize}px`,
                  "--qr-logo-size": `${previewLogoSize}px`,
                } as React.CSSProperties
              }
            >
              {svgMarkup ? (
                <>
                  <div className="qr-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                  {draft.design.logoDataUrl ? (
                    <div className="qr-logo-overlay" aria-hidden="true">
                      <img src={draft.design.logoDataUrl} alt="" />
                    </div>
                  ) : null}
                </>
              ) : (
                <p>QR hazırlanıyor...</p>
              )}
            </div>
          </div>

          <div className="preview-meta">
            <div className="meta-item">
              <span>Tür</span>
              <strong>{typeLabel(draft.type)}</strong>
            </div>
            <div className="meta-item">
              <span>İçerik</span>
              <strong className="mono">{payload || "-"}</strong>
            </div>
          </div>
        </section>
      </aside>
    </main>
    {isDistribution && (
      <footer className="miniapps-footer">
        <a href="https://miniapps.tr" aria-label="miniapps.tr">
          <img
            src={`${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`}
            alt="miniapps.tr"
            className="miniapps-footer-logo"
          />
        </a>
      </footer>
    )}
    </>
  );
}

export default App;
