import { useEffect, useRef, useState } from "react";
import { useLang } from "../lib/LangContext";
import type { LoadedVideo, ProcessSettings, Segment } from "../lib/types";

type Props = {
  video: LoadedVideo;
  settings: ProcessSettings;
  onSettingsChange: (s: ProcessSettings) => void;
  disabled: boolean;
};

type DragState =
  | { kind: "seek" }
  | { kind: "trim"; segId: string; edge: "start" | "end" };

const HISTORY_LIMIT = 5;
const KEYBOARD_NUDGE_SECONDS = 0.1;
const KEYBOARD_NUDGE_FAST_SECONDS = 1;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${String(m).padStart(2, "0")}:${sec.padStart(4, "0")}`;
}

function getSegmentIndexAtTime(segments: Segment[], time: number): number {
  return segments.findIndex((segment) => time >= segment.start && time < segment.end);
}

function clampToPlayableTime(segments: Segment[], time: number): number {
  if (segments.length === 0) return 0;
  if (time <= segments[0].start) return segments[0].start;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (time >= segment.start && time <= segment.end) {
      return Math.min(time, segment.end);
    }

    const next = segments[i + 1];
    if (next && time > segment.end && time < next.start) {
      return next.start;
    }
  }

  return segments[segments.length - 1].end;
}

function sourceToPlayableTime(segments: Segment[], time: number): number {
  let elapsed = 0;

  for (const segment of segments) {
    if (time <= segment.start) {
      return elapsed;
    }

    if (time <= segment.end) {
      return elapsed + (time - segment.start);
    }

    elapsed += segment.end - segment.start;
  }

  return elapsed;
}

function playableToSourceTime(segments: Segment[], playableTime: number): number {
  if (segments.length === 0) return 0;

  let remaining = Math.max(0, playableTime);
  for (const segment of segments) {
    const duration = segment.end - segment.start;
    if (remaining <= duration) {
      return segment.start + remaining;
    }
    remaining -= duration;
  }

  return segments[segments.length - 1].end;
}

function cloneSegments(segments: Segment[]): Segment[] {
  return segments.map((segment) => ({ ...segment }));
}

function areSegmentsEqual(a: Segment[], b: Segment[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((segment, index) => {
    const other = b[index];
    return (
      other &&
      segment.id === other.id &&
      segment.start === other.start &&
      segment.end === other.end
    );
  });
}

export default function CutPanel({ video, settings, onSettingsChange, disabled }: Props) {
  const { t } = useLang();
  const duration = video.duration;
  const segments = settings.segments;

  const timelineRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onChangeRef = useRef(onSettingsChange);
  onChangeRef.current = onSettingsChange;
  const dragStartSegmentsRef = useRef<Segment[] | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Segment[][]>([]);
  const [redoStack, setRedoStack] = useState<Segment[][]>([]);
  const minimumSegmentDuration = 0.12;

  const sortedSegs = [...segments].sort((a, b) => a.start - b.start);
  const isEdited =
    segments.length > 1 ||
    (segments.length === 1 && (segments[0].start > 0.1 || segments[0].end < duration - 0.1));
  const keptDuration = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const currentPlayableTime = sourceToPlayableTime(sortedSegs, currentTime);

  function rememberSegments(previousSegments: Segment[]): void {
    setUndoStack((history) => [...history, cloneSegments(previousSegments)].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  }

  function applySegments(nextSegments: Segment[], options: { remember?: boolean } = { remember: true }): void {
    const cur = settingsRef.current;
    if (areSegmentsEqual(cur.segments, nextSegments)) return;
    if (options.remember !== false) rememberSegments(cur.segments);
    onChangeRef.current({ ...cur, segments: cloneSegments(nextSegments) });
  }

  function undoSegments(): void {
    if (disabled || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const cur = settingsRef.current;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, cloneSegments(cur.segments)].slice(-HISTORY_LIMIT));
    onChangeRef.current({ ...cur, segments: cloneSegments(previous) });
    if (!previous.some((segment) => segment.id === selectedSegId)) {
      setSelectedSegId(null);
    }
  }

  function redoSegments(): void {
    if (disabled || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const cur = settingsRef.current;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, cloneSegments(cur.segments)].slice(-HISTORY_LIMIT));
    onChangeRef.current({ ...cur, segments: cloneSegments(next) });
    if (!next.some((segment) => segment.id === selectedSegId)) {
      setSelectedSegId(null);
    }
  }

  // Deleted regions between kept segments
  const gaps: { start: number; end: number }[] = [];
  if (duration > 0 && sortedSegs.length > 0) {
    if (sortedSegs[0].start > 0.01) gaps.push({ start: 0, end: sortedSegs[0].start });
    for (let i = 0; i < sortedSegs.length - 1; i++) {
      gaps.push({ start: sortedSegs[i].end, end: sortedSegs[i + 1].start });
    }
    const last = sortedSegs[sortedSegs.length - 1];
    if (last.end < duration - 0.01) gaps.push({ start: last.end, end: duration });
  }

  // ── Video: auto-skip gaps ──────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    const mediaEl = el;
    const skip = { active: false };

    function onTimeUpdate() {
      if (!el) return;
      const t = el.currentTime;
      setCurrentTime(t);
      if (skip.active) return;
      const sorted = [...settingsRef.current.segments].sort((a, b) => a.start - b.start);
      if (sorted.length === 0) return;

      const activeIndex = getSegmentIndexAtTime(sorted, t);
      if (activeIndex === -1) {
        const nextTime = clampToPlayableTime(sorted, t);
        if (Math.abs(nextTime - t) > 0.01) {
          skip.active = true;
          el.currentTime = nextTime;
          setCurrentTime(nextTime);
          setTimeout(() => { skip.active = false; }, 120);
          return;
        }
      }

      for (let i = 0; i < sorted.length - 1; i++) {
        if (t >= sorted[i].end - 0.05 && t < sorted[i + 1].start) {
          skip.active = true;
          el.currentTime = sorted[i + 1].start;
          setTimeout(() => { skip.active = false; }, 150);
          return;
        }
      }

      const last = sorted[sorted.length - 1];
      if (t >= last.end - 0.05) {
        el.pause();
        el.currentTime = last.end;
        setCurrentTime(last.end);
      }
    }

    function onPlay() {
      const sorted = [...settingsRef.current.segments].sort((a, b) => a.start - b.start);
      if (sorted.length === 0) return;
      const nextTime = clampToPlayableTime(sorted, mediaEl.currentTime);
      if (Math.abs(nextTime - mediaEl.currentTime) > 0.01) {
        mediaEl.currentTime = nextTime;
        setCurrentTime(nextTime);
      }
      setIsPlaying(true);
    }

    function onPause() {
      setIsPlaying(false);
    }

    mediaEl.addEventListener("timeupdate", onTimeUpdate);
    mediaEl.addEventListener("play", onPlay);
    mediaEl.addEventListener("pause", onPause);
    return () => {
      mediaEl.removeEventListener("timeupdate", onTimeUpdate);
      mediaEl.removeEventListener("play", onPlay);
      mediaEl.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    dragStartSegmentsRef.current = null;
    setSelectedSegId(null);
  }, [video.previewUrl]);

  // ── Space bar: play/pause ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const el = videoRef.current;
        if (!el) return;
        if (el.paused) void el.play();
        else el.pause();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function splitAtPlayhead(): void {
    const t = currentTime;
    const cur = settingsRef.current;
    const target =
      cur.segments.find((s) => s.id === selectedSegId && t > s.start + minimumSegmentDuration && t < s.end - minimumSegmentDuration) ??
      cur.segments.find((s) => t > s.start + minimumSegmentDuration && t < s.end - minimumSegmentDuration);

    if (!target) return;

    const left: Segment = { id: crypto.randomUUID(), start: target.start, end: t };
    const right: Segment = { id: crypto.randomUUID(), start: t, end: target.end };

    applySegments(cur.segments.flatMap((segment) => (segment.id === target.id ? [left, right] : [segment])));
    setSelectedSegId(left.id);
  }

  function deleteSelectedSegment(): void {
    const id = selectedSegId;
    if (!id) return;

    const cur = settingsRef.current;
    if (cur.segments.length <= 1) return;

    const sorted = [...cur.segments].sort((a, b) => a.start - b.start);
    const targetIndex = sorted.findIndex((segment) => segment.id === id);
    if (targetIndex < 0) return;

    const nextSelected = sorted[targetIndex - 1] ?? sorted[targetIndex + 1] ?? null;
    const nextTime = nextSelected ? nextSelected.start : 0;

    applySegments(cur.segments.filter((segment) => segment.id !== id));
    setSelectedSegId(nextSelected?.id ?? null);

    const el = videoRef.current;
    if (el) {
      el.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedSegment();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoSegments();
        else undoSegments();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoSegments();
        return;
      }

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        splitAtPlayhead();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, selectedSegId, undoStack, redoStack, disabled]);

  // ── Global mouse during drag ───────────────────────────────────────────
  useEffect(() => {
    if (!dragState) return undefined;
    const ds = dragState;

    function getT(clientX: number): number {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
    }

    function onMove(e: MouseEvent) {
      const rawTime = getT(e.clientX);
      const orderedSegments = [...settingsRef.current.segments].sort((a, b) => a.start - b.start);
      const t = ds.kind === "seek" ? clampToPlayableTime(orderedSegments, rawTime) : rawTime;

      if (ds.kind === "seek") {
        const el = videoRef.current;
        if (el) el.currentTime = t;
        setCurrentTime(t);
        return;
      }

      const cur = settingsRef.current;

      // trim
      const idx = cur.segments.findIndex(s => s.id === ds.segId);
      if (idx < 0) return;
      const seg = cur.segments[idx];
      const orderedForTrim = [...cur.segments].sort((a, b) => a.start - b.start);
      const si = orderedForTrim.findIndex(s => s.id === ds.segId);
      const prev = orderedForTrim[si - 1];
      const next = orderedForTrim[si + 1];

      const newSeg: Segment = ds.edge === "start"
        ? { ...seg, start: Math.max(prev ? prev.end + 0.05 : 0, Math.min(seg.end - minimumSegmentDuration, t)) }
        : { ...seg, end: Math.min(next ? next.start - 0.05 : duration, Math.max(seg.start + minimumSegmentDuration, t)) };

      onChangeRef.current({ ...cur, segments: cur.segments.map(s => s.id === ds.segId ? newSeg : s) });
    }

    function onUp() {
      if (ds.kind === "trim" && dragStartSegmentsRef.current) {
        const before = dragStartSegmentsRef.current;
        const after = settingsRef.current.segments;
        if (!areSegmentsEqual(before, after)) {
          rememberSegments(before);
        }
      }
      dragStartSegmentsRef.current = null;
      setDragState(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, duration]);

  // ── Timeline helpers ───────────────────────────────────────────────────
  function tlGetT(e: React.MouseEvent): number {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  }

  function handleBgDown(e: React.MouseEvent) {
    if (disabled) return;
    e.preventDefault();
    timelineRef.current?.focus();
    setSelectedSegId(null);
    const t = clampToPlayableTime(sortedSegs, tlGetT(e));
    const el = videoRef.current;
    if (el) el.currentTime = t;
    setCurrentTime(t);
    setDragState({ kind: "seek" });
  }

  function handleSegmentDown(e: React.MouseEvent, seg: Segment) {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    timelineRef.current?.focus();
    setSelectedSegId(seg.id);
    const t = clampToPlayableTime(sortedSegs, tlGetT(e));
    const el = videoRef.current;
    if (el) el.currentTime = t;
    setCurrentTime(t);
  }

  function handleHandleDown(e: React.MouseEvent, segId: string, edge: "start" | "end") {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    timelineRef.current?.focus();
    dragStartSegmentsRef.current = cloneSegments(settingsRef.current.segments);
    setDragState({ kind: "trim", segId, edge });
  }

  function handlePlayheadDown(e: React.MouseEvent) {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    timelineRef.current?.focus();
    setDragState({ kind: "seek" });
  }

  function movePlayheadBy(deltaSeconds: number) {
    if (disabled) return;
    const nextTime = clampToPlayableTime(sortedSegs, currentTime + deltaSeconds);
    const el = videoRef.current;
    if (el) {
      el.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  }

  function handleTimelineKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? KEYBOARD_NUDGE_FAST_SECONDS : KEYBOARD_NUDGE_SECONDS;
    movePlayheadBy(e.key === "ArrowRight" ? step : -step);
  }

  function reset() {
    applySegments([{ id: crypto.randomUUID(), start: 0, end: duration }]);
    setSelectedSegId(null);
  }

  function togglePlayback() {
    const el = videoRef.current;
    if (!el) return;

    if (el.paused) {
      const nextTime = clampToPlayableTime(sortedSegs, el.currentTime);
      if (Math.abs(nextTime - el.currentTime) > 0.01) {
        el.currentTime = nextTime;
        setCurrentTime(nextTime);
      }
      void el.play();
      return;
    }

    el.pause();
  }

  function seekPlayable(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled || keptDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sourceTime = playableToSourceTime(sortedSegs, ratio * keptDuration);
    const el = videoRef.current;
    if (el) {
      el.currentTime = sourceTime;
    }
    setCurrentTime(sourceTime);
  }

  const playPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const tlCursor = !dragState ? "default" : dragState.kind === "seek" ? "col-resize" : "default";
  const canSplit = segments.some((segment) => currentTime > segment.start + minimumSegmentDuration && currentTime < segment.end - minimumSegmentDuration);
  const canDeleteSelected = Boolean(selectedSegId) && segments.length > 1;
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const transportPct = keptDuration > 0 ? (currentPlayableTime / keptDuration) * 100 : 0;

  return (
    <div className="workspace-section cut-panel">
      <div className="section-header">
        <div>
          <h2>{t.cutTitle}</h2>
          {isEdited ? <p>{t.cutDescEdited(segments.length, fmt(keptDuration))}</p> : null}
        </div>
        <div className="cut-actions">
          <button type="button" className="cut-action-btn" onClick={undoSegments} disabled={disabled || !canUndo}>
            {t.cutUndo}
          </button>
          <button type="button" className="cut-action-btn" onClick={redoSegments} disabled={disabled || !canRedo}>
            {t.cutRedo}
          </button>
          <button type="button" className="cut-action-btn" onClick={splitAtPlayhead} disabled={disabled || !canSplit}>
            {t.cutSplit}
          </button>
          <button type="button" className="cut-action-btn danger" onClick={deleteSelectedSegment} disabled={disabled || !canDeleteSelected}>
            {t.cutDelete}
          </button>
          {isEdited && (
            <button type="button" className="reset-btn" onClick={reset} disabled={disabled}>
              {t.cutReset}
            </button>
          )}
        </div>
      </div>

      <video
        ref={videoRef}
        className="video-preview"
        src={video.previewUrl}
        preload="metadata"
      />

      <div className="video-transport">
        <button type="button" className="transport-btn" onClick={togglePlayback} disabled={disabled}>
          {isPlaying ? t.cutPause : t.cutPlay}
        </button>
        <div className="transport-meta">
          <span>{fmt(currentPlayableTime)}</span>
          <span>{fmt(keptDuration)}</span>
        </div>
        <div className="transport-track" onMouseDown={seekPlayable}>
          <div className="transport-fill" style={{ width: `${transportPct}%` }} />
          <div className="transport-thumb" style={{ left: `${transportPct}%` }} />
        </div>
      </div>

      <div className="timeline-wrap">
        <div
          ref={timelineRef}
          className={`timeline-track${disabled ? " tl-disabled" : ""}`}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label={t.cutPlayheadTitle}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration)}
          aria-valuenow={currentTime}
          onMouseDown={handleBgDown}
          onKeyDown={handleTimelineKeyDown}
          style={{ cursor: tlCursor }}
        >
          {/* Deleted regions */}
          {gaps.map((gap, i) => (
            <div
              key={i}
              className="tl-gap"
              style={{
                left: `${(gap.start / duration) * 100}%`,
                width: `${((gap.end - gap.start) / duration) * 100}%`,
              }}
            />
          ))}

          {/* Kept segments */}
          {segments.map((seg) => {
            const left = (seg.start / duration) * 100;
            const width = ((seg.end - seg.start) / duration) * 100;
            const isSelected = selectedSegId === seg.id;
            return (
              <div
                key={seg.id}
                className={`tl-segment${isSelected ? " is-selected" : ""}`}
                style={{ left: `${left}%`, width: `${width}%`, cursor: "pointer" }}
                onMouseDown={(e) => handleSegmentDown(e, seg)}
              >
                <div
                  className="tl-handle tl-handle-l"
                  onMouseDown={(e) => handleHandleDown(e, seg.id, "start")}
                  title={t.cutHandleStart}
                />
                <div
                  className="tl-handle tl-handle-r"
                  onMouseDown={(e) => handleHandleDown(e, seg.id, "end")}
                  title={t.cutHandleEnd}
                />
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="tl-playhead"
            style={{ left: `${playPct}%` }}
            onMouseDown={handlePlayheadDown}
            title={t.cutPlayheadTitle}
          />
        </div>

        <div className="tl-labels">
          <span>0:00</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
      {isEdited && (
        <div className="cut-segments-list">
          {sortedSegs.map((seg, i) => (
            <div
              key={seg.id}
              className={`cut-seg-chip${selectedSegId === seg.id ? " is-selected" : ""}`}
              onClick={() => setSelectedSegId(seg.id === selectedSegId ? null : seg.id)}
            >
              <span className="cut-seg-num">{i + 1}</span>
              <span className="cut-seg-range">{fmt(seg.start)} → {fmt(seg.end)}</span>
              <span className="cut-seg-dur">{fmt(seg.end - seg.start)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
