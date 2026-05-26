import { useCallback, useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };
type DragHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const HANDLES: DragHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 16;

type Props = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onConfirm: (x: number, y: number, width: number, height: number) => void;
  onCancel: () => void;
};

export default function CropModal({ src, naturalWidth, naturalHeight, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const drag = useRef<{ handle: DragHandle; sx: number; sy: number; sc: Rect } | null>(null);
  const ready = display.w > 0;

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const { width, height } = img.getBoundingClientRect();
    const w = Math.round(width);
    const h = Math.round(height);
    if (w === 0 || h === 0) return;
    setDisplay({ w, h });
    setCrop({ x: 0, y: 0, w, h });
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) { measure(); return; }
    img.addEventListener("load", measure);
    return () => img.removeEventListener("load", measure);
  }, [measure]);

  useEffect(() => {
    if (!ready) return;

    function getPoint(e: MouseEvent | TouchEvent) {
      const t = "touches" in e ? e.touches[0] : e;
      return { x: t!.clientX, y: t!.clientY };
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if (!drag.current) return;
      e.preventDefault();
      const { handle: h, sx, sy, sc } = drag.current;
      const pt = getPoint(e);
      const dx = pt.x - sx;
      const dy = pt.y - sy;
      const { w: iw, h: ih } = display;
      let { x: rx, y: ry, w: rw, h: rh } = sc;

      if (h === "move") {
        rx = Math.max(0, Math.min(iw - rw, sc.x + dx));
        ry = Math.max(0, Math.min(ih - rh, sc.y + dy));
      } else {
        if (h.includes("e")) rw = Math.max(MIN_SIZE, Math.min(iw - rx, sc.w + dx));
        if (h.includes("s")) rh = Math.max(MIN_SIZE, Math.min(ih - ry, sc.h + dy));
        if (h.includes("w")) {
          const nx = Math.max(0, Math.min(sc.x + sc.w - MIN_SIZE, sc.x + dx));
          rw = sc.w + sc.x - nx; rx = nx;
        }
        if (h.includes("n")) {
          const ny = Math.max(0, Math.min(sc.y + sc.h - MIN_SIZE, sc.y + dy));
          rh = sc.h + sc.y - ny; ry = ny;
        }
      }
      setCrop({ x: rx, y: ry, w: rw, h: rh });
    }

    function onUp() { drag.current = null; }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [display, ready]);

  function startDrag(handle: DragHandle, e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    const t = "touches" in e ? e.touches[0] : e;
    drag.current = { handle, sx: t!.clientX, sy: t!.clientY, sc: { ...crop } };
  }

  function handleConfirm() {
    const sx = naturalWidth / display.w;
    const sy = naturalHeight / display.h;
    onConfirm(
      Math.max(0, Math.round(crop.x * sx)),
      Math.max(0, Math.round(crop.y * sy)),
      Math.min(naturalWidth, Math.round(crop.w * sx)),
      Math.min(naturalHeight, Math.round(crop.h * sy)),
    );
  }

  const hintW = ready ? Math.round((crop.w / display.w) * naturalWidth) : 0;
  const hintH = ready ? Math.round((crop.h / display.h) * naturalHeight) : 0;

  return (
    <div className="crop-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="crop-modal-box">
        <div className="crop-stage">
          <img
            ref={imgRef}
            src={src}
            className="crop-stage-img"
            draggable={false}
            alt=""
            onLoad={measure}
          />
          {ready && (
            <>
              <div className="crop-dim" style={{ top: 0, left: 0, right: 0, height: crop.y }} />
              <div className="crop-dim" style={{ bottom: 0, left: 0, right: 0, top: crop.y + crop.h }} />
              <div className="crop-dim" style={{ top: crop.y, left: 0, width: crop.x, height: crop.h }} />
              <div className="crop-dim" style={{ top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h }} />
              <div
                className="crop-box"
                style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                onMouseDown={(e) => startDrag("move", e)}
                onTouchStart={(e) => startDrag("move", e)}
              >
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    className={`crop-handle crop-h-${h}`}
                    onMouseDown={(e) => startDrag(h, e)}
                    onTouchStart={(e) => startDrag(h, e)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="crop-footer">
          <span className="crop-hint">{ready ? `${hintW} × ${hintH} px` : ""}</span>
          <button type="button" className="crop-btn-cancel" onClick={onCancel}>İptal</button>
          <button type="button" className="crop-btn-confirm" onClick={handleConfirm}>Uygula</button>
        </div>
      </div>
    </div>
  );
}
