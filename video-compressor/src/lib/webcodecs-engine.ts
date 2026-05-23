// WebCodecs migration engine.
//
// This module implements a parallel processing pipeline that bypasses the
// WASM ffmpeg path entirely:
//
//   File → MP4Box demux → VideoDecoder → (scale) → VideoEncoder → mp4-muxer
//
// Compared to ffmpeg.wasm this approach uses the browser's native, often
// hardware-accelerated decoder/encoder and is not bound by the 2 GB WASM
// linear-memory cap. It currently handles VIDEO only — audio comes in a
// follow-up. While `WEBCODECS_ENABLED` is false in ffmpeg-service.ts the
// dead branch is tree-shaken and this module has zero runtime cost.
//
// Input compatibility:
//   - Container: MP4 / MOV / M4V (MP4Box.js handles ISO BMFF variants)
//   - Codecs: AVC1, HEV1/HVC1, VP9, AV1 — gated by VideoDecoder.isConfigSupported
//
// Output: MP4 with H.264 Baseline 3.1 (avc1.42E01F).
//
// Plan and historical context: ~/Desktop/video-compressor-webcodecs-plani.md

import { createFile, DataStream, Endianness } from "mp4box";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import type { LoadedVideo, ProcessSettings, Segment, VideoFormat } from "./types";

// Both muxers expose the same minimal surface we need.
type ContainerMuxer = {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
  target: { buffer: ArrayBuffer };
};

export class WebCodecsNotSupportedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WebCodecsNotSupportedError";
  }
}

export class WebCodecsNotImplementedError extends Error {
  constructor() {
    super("WebCodecs engine scaffolded but not yet implemented.");
    this.name = "WebCodecsNotImplementedError";
  }
}

export type WebCodecsCapability = {
  supported: boolean;
  reason?: string;
  codec?: string;
  hardwareAccelerated?: boolean;
};

type ConcreteFormat = Exclude<VideoFormat, "original">;

function resolveFormat(format: VideoFormat, fileName: string): ConcreteFormat {
  if (format !== "original") return format;
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ".mp4";
  if (ext === ".webm") return "webm";
  if (ext === ".mov") return "mov";
  return "mp4";
}

function codecForFormat(format: ConcreteFormat): string {
  switch (format) {
    case "mp4":
    case "mov":
      return "avc1.42E01F";
    case "webm":
      return "vp09.00.10.08";
  }
}

// Per-format codec strings. Browser-level for VideoEncoder.isConfigSupported,
// muxer-level strings for the corresponding container library.
function audioCodecForFormat(format: ConcreteFormat): { browser: string; muxer: string } {
  if (format === "webm") return { browser: "opus", muxer: "A_OPUS" };
  return { browser: "mp4a.40.2", muxer: "aac" };
}

function videoMuxerCodec(format: ConcreteFormat): string {
  if (format === "webm") return "V_VP9";
  return "avc";
}

const SUPPORTED_INPUT_EXTS = new Set([".mp4", ".mov", ".m4v"]);

function isSupportedInputContainer(fileName: string): boolean {
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return SUPPORTED_INPUT_EXTS.has(ext);
}

// Match the WASM path's adaptive downscale: very large inputs (4K/1440p) are
// shrunk to 854 px on the long side, 1080p inputs to 1280 px, smaller inputs
// pass through unchanged. Always even-numbered to satisfy H.264 encoders.
function computeTargetDimensions(srcW: number, srcH: number): { w: number; h: number } {
  const longSide = Math.max(srcW, srcH);
  let cap: number;
  if (longSide > 1920) cap = 854;
  else if (longSide > 1280) cap = 1280;
  else cap = longSide;

  if (longSide === 0) return { w: srcW, h: srcH };
  const scale = cap / longSide;
  const w = Math.max(2, Math.floor((srcW * scale) / 2) * 2);
  const h = Math.max(2, Math.floor((srcH * scale) / 2) * 2);
  return { w, h };
}

// CRF (16–40 in the UI) is mapped to a bitrate budget. Lower CRF = higher
// bitrate. This is a heuristic since WebCodecs encoders are bitrate-driven,
// not CRF-driven.
function computeBitrate(width: number, height: number, crf: number): number {
  const pixelCount = width * height;
  // Reference points: 720p (921600 px) at CRF 28 ≈ 1.2 Mbps; doubles per CRF -6.
  const crfFactor = Math.pow(2, (28 - crf) / 6);
  const base = (pixelCount / 921_600) * 1_200_000;
  return Math.max(300_000, Math.round(base * crfFactor));
}

export async function isWebCodecsSupported(
  video: LoadedVideo,
  settings: ProcessSettings,
): Promise<WebCodecsCapability> {
  if (typeof window === "undefined") {
    return { supported: false, reason: "no window" };
  }
  if (typeof window.VideoEncoder !== "function" || typeof window.VideoDecoder !== "function") {
    return { supported: false, reason: "VideoEncoder / VideoDecoder unavailable" };
  }
  if (!isSupportedInputContainer(video.fileName)) {
    return { supported: false, reason: "input container not supported by demuxer" };
  }

  const resolvedFormat = resolveFormat(settings.outputFormat, video.fileName);
  const codec = codecForFormat(resolvedFormat);
  const target = computeTargetDimensions(video.width || 1280, video.height || 720);
  const bitrate = computeBitrate(target.w, target.h, settings.videoCrf);

  try {
    const support = await window.VideoEncoder.isConfigSupported({
      codec,
      width: target.w,
      height: target.h,
      bitrate,
      framerate: 30,
    });
    if (!support.supported) {
      return { supported: false, reason: `encoder rejected config (${codec})`, codec };
    }
    return {
      supported: true,
      codec,
      hardwareAccelerated: support.config?.hardwareAcceleration === "prefer-hardware",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { supported: false, reason: `probe threw: ${message}`, codec };
  }
}

// ── Demux ──────────────────────────────────────────────────────────────────

type DemuxSample = {
  data: Uint8Array;
  dts: number;
  cts: number;
  duration: number;
  isSync: boolean;
};

type DemuxResult = {
  width: number;
  height: number;
  durationSec: number;
  timescale: number;
  codec: string;
  description: Uint8Array | null;
  samples: DemuxSample[];
  framerate: number;
  audio: DemuxAudio | null;
};

type DemuxAudio = {
  codec: string;            // browser-style codec string (e.g. mp4a.40.2)
  sampleRate: number;
  numberOfChannels: number;
  description: Uint8Array | null;
  timescale: number;
  samples: DemuxSample[];
};

function extractCodecDescription(mp4: any, trackId: number): Uint8Array | null {
  const trak = mp4.getTrackById(trackId);
  if (!trak) return null;
  const entries = trak.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(stream);
      // Box layout starts with an 8-byte header (size + 4cc); the codec
      // description that VideoDecoder expects is the box body only.
      return new Uint8Array(stream.buffer.slice(8));
    }
  }
  return null;
}

// AAC audio inside an ISO BMFF box carries its decoder-specific config (the
// AudioSpecificConfig, AAC ASC) buried under esds → ES_Descriptor →
// DecoderConfigDescriptor → DecoderSpecificInfo.data. Mp4box's typings don't
// expose `data`, but it's there at runtime. AudioDecoder.configure({ ...,
// description }) expects exactly these ASC bytes.
function extractAudioDescription(mp4: any, trackId: number): Uint8Array | null {
  const trak = mp4.getTrackById(trackId);
  if (!trak) return null;
  const entries = trak.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries) {
    const esds = (entry as any).esds;
    if (!esds?.esd?.descs) continue;
    for (const dcd of esds.esd.descs) {
      const inner = dcd?.descs;
      if (!Array.isArray(inner)) continue;
      for (const dsi of inner) {
        const data: ArrayBuffer | Uint8Array | undefined = (dsi as any)?.data;
        if (!data) continue;
        return data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
      }
    }
  }
  return null;
}

async function demuxMp4(file: File): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const mp4: any = createFile();
    let resolved = false;
    let videoTrack: any = null;
    let audioTrack: any = null;
    const videoSamples: DemuxSample[] = [];
    const audioSamples: DemuxSample[] = [];
    let expectedVideo = 0;
    let expectedAudio = 0;

    const settle = (fn: () => void) => {
      if (resolved) return;
      resolved = true;
      fn();
    };

    const tryResolve = () => {
      const videoDone = videoSamples.length >= expectedVideo && videoTrack;
      const audioDone = !audioTrack || audioSamples.length >= expectedAudio;
      if (!videoDone || !audioDone) return;

      videoSamples.sort((a, b) => a.dts - b.dts);
      const videoDescription = extractCodecDescription(mp4, videoTrack.id);
      const durationSec = videoTrack.duration / videoTrack.timescale;
      const framerate = durationSec > 0 ? videoTrack.nb_samples / durationSec : 30;

      let audio: DemuxAudio | null = null;
      if (audioTrack) {
        audioSamples.sort((a, b) => a.dts - b.dts);
        const audioDescription = extractAudioDescription(mp4, audioTrack.id);
        audio = {
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio?.sample_rate ?? 48000,
          numberOfChannels: audioTrack.audio?.channel_count ?? 2,
          description: audioDescription,
          timescale: audioTrack.timescale,
          samples: audioSamples,
        };
      }

      settle(() => resolve({
        width: videoTrack.video.width,
        height: videoTrack.video.height,
        durationSec,
        timescale: videoTrack.timescale,
        codec: videoTrack.codec,
        description: videoDescription,
        samples: videoSamples,
        framerate,
        audio,
      }));
    };

    mp4.onError = (msg: string) => settle(() => reject(new Error(`MP4Box: ${msg}`)));

    mp4.onReady = (info: any) => {
      const video = info.videoTracks?.[0] ?? info.tracks?.find((t: any) => t.type === "video");
      if (!video) {
        settle(() => reject(new Error("No video track in MP4")));
        return;
      }
      videoTrack = video;
      expectedVideo = video.nb_samples;
      mp4.setExtractionOptions(video.id, "video", { nbSamples: 500 });

      const audio = info.audioTracks?.[0] ?? info.tracks?.find((t: any) => t.type === "audio");
      if (audio) {
        audioTrack = audio;
        expectedAudio = audio.nb_samples;
        mp4.setExtractionOptions(audio.id, "audio", { nbSamples: 500 });
      }

      mp4.start();
    };

    mp4.onSamples = (_id: number, user: any, sampleArr: any[]) => {
      const target = user === "audio" ? audioSamples : videoSamples;
      for (const s of sampleArr) {
        target.push({
          data: new Uint8Array(s.data),
          dts: s.dts,
          cts: s.cts,
          duration: s.duration,
          isSync: !!s.is_sync,
        });
      }
      tryResolve();
    };

    // Feed the entire file at once. For typical user videos (< 500 MB) this
    // is well within memory budget; for larger files a streaming reader
    // would be safer but adds complexity that we will tackle later.
    file.arrayBuffer().then((buffer) => {
      (buffer as any).fileStart = 0;
      mp4.appendBuffer(buffer);
      mp4.flush();
    }).catch((err) => settle(() => reject(err)));
  });
}

// ── Segment slicing ────────────────────────────────────────────────────────
//
// Each output segment must start playback from a sync sample (keyframe). We
// include the nearest-prior keyframe in the "samples to feed the decoder"
// list and use a separate predicate to decide which DECODED frames actually
// belong to the output range.

type SegmentPlan = {
  startSec: number;
  endSec: number;
  feedSamples: DemuxSample[];
  outputStartUs: number;
  outputDurationUs: number;
};

function planSegments(
  segments: Segment[],
  demux: DemuxResult,
  outputCursorStartUs: number,
): SegmentPlan[] {
  const sortedSegs = [...segments]
    .filter((s) => s.end - s.start > 0.1)
    .sort((a, b) => a.start - b.start);

  let outputCursor = outputCursorStartUs;
  const plans: SegmentPlan[] = [];

  for (const seg of sortedSegs) {
    const startTs = seg.start * demux.timescale;
    const endTs = seg.end * demux.timescale;

    // Find the nearest sync sample whose DTS is <= startTs.
    let firstSyncIdx = 0;
    for (let i = 0; i < demux.samples.length; i++) {
      if (demux.samples[i].dts > startTs) break;
      if (demux.samples[i].isSync) firstSyncIdx = i;
    }

    // Collect samples from firstSyncIdx until the first sample whose DTS
    // exceeds endTs (so decoded frames cover the full requested range).
    const feed: DemuxSample[] = [];
    for (let i = firstSyncIdx; i < demux.samples.length; i++) {
      const s = demux.samples[i];
      if (s.dts >= endTs) break;
      feed.push(s);
    }

    const durationUs = Math.round((seg.end - seg.start) * 1_000_000);
    plans.push({
      startSec: seg.start,
      endSec: seg.end,
      feedSamples: feed,
      outputStartUs: outputCursor,
      outputDurationUs: durationUs,
    });
    outputCursor += durationUs;
  }

  return plans;
}

// AAC frames are independent so we don't need keyframe alignment, but each
// sample still covers ~21 ms (1024 audio samples at 48 kHz). For a clean
// cut we include every audio sample whose timing range intersects the
// requested segment window.
function planAudioFeed(audio: DemuxAudio, startSec: number, endSec: number): DemuxSample[] {
  const startTs = startSec * audio.timescale;
  const endTs = endSec * audio.timescale;
  const out: DemuxSample[] = [];
  for (const s of audio.samples) {
    const sampleEnd = s.dts + s.duration;
    if (sampleEnd <= startTs) continue;
    if (s.dts >= endTs) break;
    out.push(s);
  }
  return out;
}

// ── Decoder/Encoder probe ──────────────────────────────────────────────────

async function probeDecoder(codec: string, width: number, height: number, description: Uint8Array | null): Promise<boolean> {
  try {
    const config: VideoDecoderConfig = {
      codec,
      codedWidth: width,
      codedHeight: height,
    };
    if (description) config.description = description;
    const support = await window.VideoDecoder.isConfigSupported(config);
    return !!support.supported;
  } catch {
    return false;
  }
}

async function probeAudioPair(
  decoderCodec: string,
  encoderCodec: string,
  sampleRate: number,
  numberOfChannels: number,
  bitrate: number,
  description: Uint8Array | null,
): Promise<boolean> {
  if (typeof window.AudioDecoder !== "function" || typeof window.AudioEncoder !== "function") {
    return false;
  }
  try {
    const decoderConfig: AudioDecoderConfig = { codec: decoderCodec, sampleRate, numberOfChannels };
    if (description) decoderConfig.description = description;
    const dec = await window.AudioDecoder.isConfigSupported(decoderConfig);
    if (!dec.supported) return false;
    const enc = await window.AudioEncoder.isConfigSupported({
      codec: encoderCodec,
      sampleRate,
      numberOfChannels,
      bitrate,
    });
    return !!enc.supported;
  } catch {
    return false;
  }
}

// ── Frame scaling via OffscreenCanvas ──────────────────────────────────────

class FrameScaler {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new WebCodecsNotSupportedError("OffscreenCanvas 2D context unavailable");
    this.ctx = ctx;
  }
  // Scale `frame` into our canvas and produce a new VideoFrame at the
  // target resolution. `timestampUs` overrides the timestamp so output
  // frames are contiguous across segments.
  scale(frame: VideoFrame, timestampUs: number): VideoFrame {
    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
    return new VideoFrame(this.canvas, {
      timestamp: timestampUs,
      duration: frame.duration ?? undefined,
      alpha: "discard",
    });
  }
}

// ── Main pipeline ──────────────────────────────────────────────────────────

export async function processVideoWithWebCodecs(
  video: LoadedVideo,
  settings: ProcessSettings,
  onProgress: (p: number) => void,
): Promise<{ blob: Blob; fileName: string }> {
  if (!isSupportedInputContainer(video.fileName)) {
    throw new WebCodecsNotSupportedError("Input container not supported");
  }

  const outputFormat = resolveFormat(settings.outputFormat, video.fileName);

  onProgress(0.02);

  // Demux input
  const demux = await demuxMp4(video.file);
  if (demux.samples.length === 0) {
    throw new WebCodecsNotSupportedError("No video samples extracted from input");
  }

  // Probe the input decoder. If unsupported (rare-codec input, exotic
  // profile), fall back to WASM by throwing the not-supported error.
  const decoderOk = await probeDecoder(demux.codec, demux.width, demux.height, demux.description);
  if (!decoderOk) {
    throw new WebCodecsNotSupportedError(`Decoder rejected codec ${demux.codec}`);
  }

  // Build segment plan with keyframe alignment
  const plans = planSegments(settings.segments, demux, 0);
  if (plans.length === 0) {
    throw new Error("No valid segments in input");
  }
  const totalOutputDurationUs = plans[plans.length - 1].outputStartUs + plans[plans.length - 1].outputDurationUs;

  // Compute target dimensions and configure encoder + muxer
  const target = computeTargetDimensions(demux.width, demux.height);
  const targetCodec = codecForFormat(outputFormat);
  const bitrate = computeBitrate(target.w, target.h, settings.videoCrf);

  // Decide on audio path. The input must have an audio track AND the user
  // must not have explicitly disabled audio. We probe both decoder and
  // encoder up-front: if either rejects we silently drop audio (similar to
  // the WASM path's `-an` fallback) rather than failing the whole job.
  const audioCodecs = audioCodecForFormat(outputFormat);
  const targetAudioCodec = audioCodecs.browser;
  const audioBitrate = (Number.parseInt(settings.audioBitrate, 10) || 128) * 1000;
  let useAudio = settings.includeAudio && demux.audio !== null;
  if (useAudio && demux.audio) {
    const audioOk = await probeAudioPair(
      demux.audio.codec,
      targetAudioCodec,
      demux.audio.sampleRate,
      demux.audio.numberOfChannels,
      audioBitrate,
      demux.audio.description,
    );
    if (!audioOk) {
      useAudio = false;
    }
  }

  // Output-container-specific muxer. Both libraries expose the same minimal
  // surface (`addVideoChunk`, `addAudioChunk`, `finalize`, `target.buffer`)
  // so the rest of the pipeline is agnostic.
  const muxerVideoCodec = videoMuxerCodec(outputFormat);
  let muxer: ContainerMuxer;
  if (outputFormat === "webm") {
    const m = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: muxerVideoCodec, width: target.w, height: target.h, frameRate: demux.framerate },
      audio: useAudio && demux.audio
        ? {
            codec: audioCodecs.muxer,
            sampleRate: demux.audio.sampleRate,
            numberOfChannels: demux.audio.numberOfChannels,
          }
        : undefined,
      firstTimestampBehavior: "offset",
    });
    muxer = m as unknown as ContainerMuxer;
  } else {
    const m = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: muxerVideoCodec as "avc" | "hevc" | "vp9" | "av1", width: target.w, height: target.h, frameRate: demux.framerate },
      audio: useAudio && demux.audio
        ? {
            codec: audioCodecs.muxer as "aac" | "opus",
            sampleRate: demux.audio.sampleRate,
            numberOfChannels: demux.audio.numberOfChannels,
          }
        : undefined,
      fastStart: "in-memory",
    });
    muxer = m as unknown as ContainerMuxer;
  }

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e: DOMException) => {
      encoderError = new Error(`Encoder error: ${e.message}`);
    },
  });

  const encoderConfig: VideoEncoderConfig = {
    codec: targetCodec,
    width: target.w,
    height: target.h,
    bitrate,
    framerate: demux.framerate,
  };
  // avcC bitstream format is only meaningful for H.264 inside an MP4 container.
  // VP9/AV1 in WebM don't need it (and rejecting unknown fields would error).
  if (outputFormat !== "webm") {
    encoderConfig.avc = { format: "avc" };
  }
  encoder.configure(encoderConfig);

  // Decode + (scale) + encode each segment
  const needsScale = target.w !== demux.width || target.h !== demux.height;
  const scaler = needsScale ? new FrameScaler(target.w, target.h) : null;

  let outputFrameCount = 0;
  let processedSegmentsDurationUs = 0;
  const totalFramesEstimate = Math.max(1, Math.round((totalOutputDurationUs / 1_000_000) * demux.framerate));

  for (let segIdx = 0; segIdx < plans.length; segIdx++) {
    const plan = plans[segIdx];
    const segStartUsInput = plan.startSec * 1_000_000;
    const segEndUsInput = plan.endSec * 1_000_000;
    const segDurationUs = plan.outputDurationUs;

    let decoderError: Error | null = null;
    const segOutputBaseUs = plan.outputStartUs;

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        try {
          const inputTs = frame.timestamp;
          if (inputTs < segStartUsInput || inputTs >= segEndUsInput) {
            frame.close();
            return;
          }
          const remappedTs = segOutputBaseUs + (inputTs - segStartUsInput);

          let outFrame: VideoFrame;
          if (scaler) {
            outFrame = scaler.scale(frame, remappedTs);
            frame.close();
          } else {
            // Re-time the frame in place. VideoFrame from a frame source
            // allows overriding timestamp via copy constructor.
            outFrame = new VideoFrame(frame, { timestamp: remappedTs });
            frame.close();
          }

          encoder.encode(outFrame, { keyFrame: outputFrameCount === 0 });
          outFrame.close();
          outputFrameCount++;

          // Smooth progress: encoded fraction within the total expected.
          const fraction = Math.min(1, outputFrameCount / totalFramesEstimate);
          onProgress(0.05 + fraction * 0.9);
        } catch (err) {
          decoderError = err instanceof Error ? err : new Error(String(err));
        }
      },
      error: (e: DOMException) => {
        decoderError = new Error(`Decoder error: ${e.message}`);
      },
    });

    const decoderConfig: VideoDecoderConfig = {
      codec: demux.codec,
      codedWidth: demux.width,
      codedHeight: demux.height,
    };
    if (demux.description) decoderConfig.description = demux.description;
    decoder.configure(decoderConfig);

    for (const sample of plan.feedSamples) {
      if (decoderError) break;
      const timestampUs = (sample.cts / demux.timescale) * 1_000_000;
      const durationUs = (sample.duration / demux.timescale) * 1_000_000;
      decoder.decode(new EncodedVideoChunk({
        type: sample.isSync ? "key" : "delta",
        timestamp: timestampUs,
        duration: durationUs,
        data: sample.data,
      }));
    }

    await decoder.flush();
    decoder.close();
    if (decoderError) throw decoderError;
    if (encoderError) throw encoderError;

    processedSegmentsDurationUs += segDurationUs;
    onProgress(0.05 + (processedSegmentsDurationUs / Math.max(1, totalOutputDurationUs)) * 0.9);
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;

  // Audio pass: decode + remap + re-encode in a single pipeline so AAC
  // priming only happens once. AudioData is copied (f32 interleaved) with
  // a remapped timestamp before being fed back into the encoder.
  if (useAudio && demux.audio) {
    const audio = demux.audio;
    let audioError: Error | null = null;

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e: DOMException) => { audioError = new Error(`Audio encoder: ${e.message}`); },
    });
    audioEncoder.configure({
      codec: targetAudioCodec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      bitrate: audioBitrate,
    });

    const audioDecoder = new AudioDecoder({
      output: (data: AudioData) => {
        try {
          const inputTsUs = data.timestamp;
          // Map this AudioData to the segment plan that contains it.
          const planMatch = plans.find((p) => {
            const startUs = p.startSec * 1_000_000;
            const endUs = p.endSec * 1_000_000;
            return inputTsUs >= startUs && inputTsUs < endUs;
          });
          if (!planMatch) {
            data.close();
            return;
          }
          const segStartUs = planMatch.startSec * 1_000_000;
          const remappedTs = planMatch.outputStartUs + (inputTsUs - segStartUs);

          const size = data.allocationSize({ planeIndex: 0, format: "f32" });
          const buffer = new ArrayBuffer(size);
          data.copyTo(buffer, { planeIndex: 0, format: "f32" });
          const remapped = new AudioData({
            timestamp: remappedTs,
            numberOfFrames: data.numberOfFrames,
            numberOfChannels: data.numberOfChannels,
            sampleRate: data.sampleRate,
            format: "f32",
            data: buffer,
          });
          data.close();
          audioEncoder.encode(remapped);
          remapped.close();
        } catch (err) {
          audioError = err instanceof Error ? err : new Error(String(err));
        }
      },
      error: (e: DOMException) => { audioError = new Error(`Audio decoder: ${e.message}`); },
    });

    const audioDecoderConfig: AudioDecoderConfig = {
      codec: audio.codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
    };
    if (audio.description) audioDecoderConfig.description = audio.description;
    audioDecoder.configure(audioDecoderConfig);

    for (const plan of plans) {
      if (audioError) break;
      const feed = planAudioFeed(audio, plan.startSec, plan.endSec);
      for (const sample of feed) {
        const timestampUs = (sample.cts / audio.timescale) * 1_000_000;
        const durationUs = (sample.duration / audio.timescale) * 1_000_000;
        audioDecoder.decode(new EncodedAudioChunk({
          type: "key",
          timestamp: timestampUs,
          duration: durationUs,
          data: sample.data,
        }));
      }
    }

    await audioDecoder.flush();
    audioDecoder.close();
    await audioEncoder.flush();
    audioEncoder.close();
    if (audioError) throw audioError;
  }

  muxer.finalize();
  onProgress(0.98);

  const buffer = muxer.target.buffer;
  const mime = outputFormat === "webm" ? "video/webm" : outputFormat === "mov" ? "video/quicktime" : "video/mp4";
  const ext = outputFormat === "webm" ? ".webm" : outputFormat === "mov" ? ".mov" : ".mp4";
  const blob = new Blob([buffer], { type: mime });

  const baseName = video.fileName.replace(/\.[^.]+$/, "");
  const isFullVideo =
    settings.segments.length === 1 &&
    settings.segments[0].start <= 0.05 &&
    settings.segments[0].end >= video.duration - 0.05;
  const suffix = isFullVideo ? "_compressed" : "_cut";
  onProgress(1);
  return { blob, fileName: `${baseName}${suffix}${ext}` };
}
