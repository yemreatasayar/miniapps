import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { drawWaveform } from "../lib/waveform";

export type WaveformTarget = "start" | "end" | "playhead";

type WaveformProps = {
  data: Float32Array;
  duration: number;
  startSec: number;
  endSec: number;
  playheadSec: number;
  activeTarget: WaveformTarget;
  disabled?: boolean;
  onSelectionChange: (start: number, end: number) => void;
  onPlayheadChange: (sec: number) => void;
  onActiveTargetChange: (target: WaveformTarget) => void;
  onNudge: (deltaSec: number) => void;
  onTogglePlayback: () => void;
};

type DragTarget = WaveformTarget | "none";

export default function Waveform({
  data,
  duration,
  startSec,
  endSec,
  playheadSec,
  activeTarget,
  disabled = false,
  onSelectionChange,
  onPlayheadChange,
  onActiveTargetChange,
  onNudge,
  onTogglePlayback,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<DragTarget>("none");
  const safeDuration = Math.max(duration, 0.1);
  const startRatio = startSec / safeDuration;
  const endRatio = endSec / safeDuration;
  const playheadRatio = playheadSec >= 0 ? playheadSec / safeDuration : -1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform(canvas, { data, startRatio, endRatio, playheadRatio, activeTarget });
  }, [activeTarget, data, endRatio, playheadRatio, startRatio]);

  const getRatioFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.focus();
      canvas.setPointerCapture(event.pointerId);

      const ratio = getRatioFromEvent(event);
      const distanceToStart = Math.abs(ratio - startRatio);
      const distanceToEnd = Math.abs(ratio - endRatio);
      const distanceToPlayhead =
        playheadRatio >= 0 ? Math.abs(ratio - playheadRatio) : Number.POSITIVE_INFINITY;

      if (distanceToStart < 0.03) {
        draggingRef.current = "start";
        onActiveTargetChange("start");
      } else if (distanceToEnd < 0.03) {
        draggingRef.current = "end";
        onActiveTargetChange("end");
      } else if (distanceToPlayhead < 0.03) {
        draggingRef.current = "playhead";
        onActiveTargetChange("playhead");
      } else {
        draggingRef.current = "playhead";
        onActiveTargetChange("playhead");
        onPlayheadChange(ratio * safeDuration);
      }
    },
    [disabled, endRatio, getRatioFromEvent, onActiveTargetChange, onPlayheadChange, playheadRatio, safeDuration, startRatio]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      if (draggingRef.current === "none") return;
      const sec = getRatioFromEvent(event) * safeDuration;

      if (draggingRef.current === "start") {
        onSelectionChange(Math.min(sec, endSec - 0.1), endSec);
      } else if (draggingRef.current === "end") {
        onSelectionChange(startSec, Math.max(sec, startSec + 0.1));
      } else {
        onPlayheadChange(sec);
      }
    },
    [disabled, endSec, getRatioFromEvent, onPlayheadChange, onSelectionChange, safeDuration, startSec]
  );

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = "none";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      width={800}
      height={140}
      tabIndex={disabled ? -1 : 0}
      role="application"
      aria-disabled={disabled}
      aria-label="Ses önizleme dalga formu. Yön tuşlarıyla seçili noktayı hassas ayarla."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === " ") {
          event.preventDefault();
          onTogglePlayback();
          return;
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const step = event.shiftKey ? 1 : 0.1;
          onNudge(event.key === "ArrowRight" ? step : -step);
        }
      }}
    />
  );
}
