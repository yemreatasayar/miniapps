import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  originalUrl: string;
  resultUrl: string;
};

export default function CompareSlider({ originalUrl, resultUrl }: Props) {
  const [position, setPosition] = useState(50);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (dragging.current) updatePosition(event.clientX);
    }

    function onMouseUp() {
      dragging.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (dragging.current) updatePosition(event.touches[0].clientX);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [updatePosition]);

  return (
    <div className="compare-slider">
      <div className="compare-stage" ref={stageRef}>
        <div className="compare-layer compare-layer-original">
          <img src={originalUrl} alt="Orijinal görsel" className="compare-image" />
          <span className="compare-label compare-label-left">Önce</span>
        </div>

        <div
          className="compare-layer compare-layer-result"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img src={resultUrl} alt="Arka plan kaldırılmış görsel" className="compare-image" />
          <span className="compare-label compare-label-right">Sonra</span>
        </div>

        <div
          className="compare-handle"
          style={{ left: `${position}%` }}
          onMouseDown={(event) => {
            event.preventDefault();
            dragging.current = true;
          }}
          onTouchStart={(event) => {
            event.preventDefault();
            dragging.current = true;
          }}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-label="Karşılaştırma kaydırıcısı"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setPosition((current) => Math.max(0, current - 2));
            if (event.key === "ArrowRight") setPosition((current) => Math.min(100, current + 2));
          }}
        >
          <div className="compare-handle-knob">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 4L1 10L7 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M13 4L19 10L13 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
