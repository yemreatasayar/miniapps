import { useRef } from "react";
import type {
  LoadedPdf,
  PdfPage,
  WatermarkColor,
  WatermarkSettings,
  WatermarkTarget,
  WatermarkType,
} from "../lib/types";
import WatermarkPreview from "./WatermarkPreview";

type WatermarkPanelProps = {
  loadedPdf: LoadedPdf | null;
  pages: PdfPage[];
  selectedPages: Set<number>;
  settings: WatermarkSettings;
  onSettingsChange: (s: WatermarkSettings) => void;
  onApply: () => void;
  busy: boolean;
};

const COLOR_OPTIONS: Array<{ value: WatermarkColor; label: string }> = [
  { value: "gray", label: "Gri" },
  { value: "black", label: "Siyah" },
  { value: "white", label: "Beyaz" },
];

const FONT_SIZES = [24, 36, 48, 64, 80, 96];
const IMAGE_SCALES = [0.2, 0.3, 0.4, 0.5, 0.6];

async function fileToDataUrl(file: File): Promise<string> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

  if (isSvg) {
    // SVG → canvas → PNG
    const svgUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = svgUrl;
    });
    URL.revokeObjectURL(svgUrl);
    const size = Math.max(img.naturalWidth || 512, img.naturalHeight || 512, 64);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || size;
    canvas.height = img.naturalHeight || size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context alınamadı.");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // PNG / JPG → doğrudan data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function WatermarkPanel({
  loadedPdf,
  pages,
  selectedPages,
  settings,
  onSettingsChange,
  onApply,
  busy,
}: WatermarkPanelProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  function update<K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  function setType(type: WatermarkType) {
    onSettingsChange({ ...settings, type });
  }

  async function handleImageFile(file: File) {
    try {
      const dataUrl = await fileToDataUrl(file);
      onSettingsChange({
        ...settings,
        type: "image",
        imageDataUrl: dataUrl,
        imageFileName: file.name,
      });
    } catch {
      // sessizce geç — geçersiz dosya
    }
  }

  const targetLabel: Record<WatermarkTarget, string> = {
    all: "Tüm sayfalar",
    selected: `Seçili (${selectedPages.size})`,
  };

  const canApply =
    Boolean(loadedPdf) &&
    (settings.type === "text" ? settings.text.trim().length > 0 : settings.imageDataUrl !== null);

  return (
    <section className="watermark-panel">
      <div className="watermark-layout">
        {/* Sol: ayarlar */}
        <div className="watermark-settings">
          <div className="section-header">
            <div>
              <h2>Watermark</h2>
              <p>Metin veya logo filigranı ekle</p>
            </div>
          </div>

          {/* Tip seçimi */}
          <div className="watermark-type-tabs">
            {(["text", "image"] as WatermarkType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={settings.type === t ? "is-active" : ""}
                onClick={() => setType(t)}
              >
                {t === "text" ? "Metin" : "Logo / Görsel"}
              </button>
            ))}
          </div>

          <div className="watermark-form">
            {settings.type === "text" ? (
              <>
                <div className="watermark-field">
                  <label className="watermark-label" htmlFor="wm-text">Metin</label>
                  <input
                    id="wm-text"
                    type="text"
                    className="watermark-input"
                    value={settings.text}
                    placeholder="GIZLI, TASLAK, KOPYA..."
                    maxLength={60}
                    onChange={(e) => update("text", e.target.value)}
                  />
                </div>

                <div className="watermark-field">
                  <label className="watermark-label">Font Boyutu</label>
                  <div className="watermark-size-group">
                    {FONT_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={settings.fontSize === size ? "is-active" : ""}
                        onClick={() => update("fontSize", size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="watermark-field">
                  <label className="watermark-label">Renk</label>
                  <div className="watermark-color-group">
                    {COLOR_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`watermark-color-btn watermark-color-${value}${settings.color === value ? " is-active" : ""}`}
                        onClick={() => update("color", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="watermark-field">
                  <label className="watermark-label">Dosya (PNG, JPG, SVG)</label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageFile(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="watermark-upload-btn"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {settings.imageFileName ?? "Dosya Seç"}
                  </button>
                  {settings.imageDataUrl && (
                    <img
                      src={settings.imageDataUrl}
                      alt="Seçili logo"
                      className="watermark-image-thumb"
                    />
                  )}
                </div>

                <div className="watermark-field">
                  <label className="watermark-label">Boyut (sayfa genişliğine oranı)</label>
                  <div className="watermark-size-group">
                    {IMAGE_SCALES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={settings.imageScale === s ? "is-active" : ""}
                        onClick={() => update("imageScale", s)}
                      >
                        {Math.round(s * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Ortak ayarlar */}
            <div className="watermark-field">
              <label className="watermark-label" htmlFor="wm-opacity">
                Opaklık — {Math.round(settings.opacity * 100)}%
              </label>
              <input
                id="wm-opacity"
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={settings.opacity}
                onChange={(e) => update("opacity", Number(e.target.value))}
              />
            </div>

            <div className="watermark-field">
              <label className="watermark-label">Hedef</label>
              <div className="watermark-target-group">
                {(["all", "selected"] as WatermarkTarget[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={settings.target === t ? "is-active" : ""}
                    disabled={t === "selected" && selectedPages.size === 0}
                    onClick={() => update("target", t)}
                  >
                    {targetLabel[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="watermark-apply-button"
            disabled={!canApply || busy}
            onClick={onApply}
          >
            {busy ? "Uygulanıyor..." : "Uygula ve İndir"}
          </button>
        </div>

        {/* Sağ: canlı önizleme */}
        <WatermarkPreview
          fileBytes={loadedPdf?.fileBytes ?? null}
          pages={pages}
          settings={settings}
          selectedPages={selectedPages}
        />
      </div>
    </section>
  );
}
