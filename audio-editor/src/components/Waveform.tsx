import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { drawWaveform } from "../lib/waveform";

type WaveformProps = {
  data: Float32Array;
  duration: number;
  startSec: number;
  endSec: number;
  playheadSec: number;
  onSelectionChange: (start: number, end: number) => void;
  readOnly?: boolean;
  onTogglePlayback?: () => void;
};

type DragTarget = "start" | "end" | "none";

export default function Waveform({
  data,
  duration,
  startSec,
  endSec,
  playheadSec,
  onSelectionChange,
  readOnly = false,
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

    drawWaveform(canvas, {
      data,
      startRatio: readOnly ? 0 : startRatio,
      endRatio: readOnly ? 1 : endRatio,
      playheadRatio,
      colorBase: "#6e78d8",
      colorSelected: "#7c5cff",
      colorPlayhead: "#ffffff",
      bgColor: "#140c35",
    });
  }, [data, endRatio, playheadRatio, readOnly, startRatio]);

  const getRatioFromEvent = useCallback((event: ReactMouseEvent<HTMLCanvasElement> | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      canvasRef.current?.focus();

      if (readOnly) return;

      const ratio = getRatioFromEvent(event);
      const distanceToStart = Math.abs(ratio - startRatio);
      const distanceToEnd = Math.abs(ratio - endRatio);

      if (distanceToStart < 0.03) {
        draggingRef.current = "start";
      } else if (distanceToEnd < 0.03) {
        draggingRef.current = "end";
      } else {
        draggingRef.current = "start";
        onSelectionChange(ratio * safeDuration, endSec);
      }
    },
    [endRatio, endSec, getRatioFromEvent, onSelectionChange, readOnly, safeDuration, startRatio]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (draggingRef.current === "none") return;

      const ratio = getRatioFromEvent(event);
      const sec = ratio * safeDuration;

      if (draggingRef.current === "start") {
        onSelectionChange(Math.min(sec, endSec - 0.1), endSec);
      } else {
        onSelectionChange(startSec, Math.max(sec, startSec + 0.1));
      }
    };

    const handleMouseUp = () => {
      draggingRef.current = "none";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [endSec, getRatioFromEvent, onSelectionChange, safeDuration, startSec]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      width={800}
      height={120}
      tabIndex={0}
      role="application"
      aria-label="Ses önizleme dalga formu"
      onMouseDown={handleMouseDown}
      onKeyDown={(event) => {
        if (event.key === " " && onTogglePlayback) {
          event.preventDefault();
          onTogglePlayback();
        }
      }}
      style={{ cursor: readOnly ? "default" : "crosshair" }}
    />
  );
}
