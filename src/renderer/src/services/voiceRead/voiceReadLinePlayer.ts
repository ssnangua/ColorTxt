/**
 * 朗读会话：系统 / Edge（主进程 MP3）/ DashScope（SSE）。
 * Edge / DashScope 播放模型：切段 + AudioContext 时间线排播、
 * Edge 多段并行 fetch（buffer 4）；DashScope 按段合成后逐段排播。
 * 暴露 `speakChunks` / `onChunkChange` 供后续「上一句 / 下一句」按段跳转。
 */

import type { VoiceReadSettings } from "../../constants/voiceRead";
import { toVoiceReadEdgeTtsRequest } from "../../constants/voiceRead";
import {
  hasVoiceReadSpeakableText,
  splitVoiceReadChunks,
  VOICE_READ_CHUNK_UNITS_DEFAULT,
  VOICE_READ_CHUNK_UNITS_EDGE,
} from "./voiceReadTextChunks";

const DASH_PCM_SAMPLE_RATE = 24000;
/** 已合成段保留在内存，跳转不重拉 */
const EDGE_MP3_CACHE_LIMIT = 64;
const DASH_PCM_CACHE_LIMIT = 48;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Edge 返回的 MP3 至少应具备 ID3 或 MPEG 帧同步头 */
function isEdgeMp3PayloadValid(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 10) return false;
  const u8 = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4));
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return true;
  if (u8[0] === 0xff && (u8[1]! & 0xe0) === 0xe0) return true;
  return false;
}

function isDecodeAudioDataEncodingError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "EncodingError") return true;
  if (err instanceof Error && /decode audio/i.test(err.message)) return true;
  return false;
}

function normalizeLineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lineCacheKey(settings: VoiceReadSettings, text: string): string {
  const t = normalizeLineText(text);
  return [
    settings.engine,
    settings.voiceId.trim(),
    settings.rate,
    settings.pitch,
    settings.dashscopeApiKey.trim(),
    t,
  ].join("\u0001");
}

function chunkCacheKey(settings: VoiceReadSettings, chunkText: string): string {
  return lineCacheKey(settings, chunkText);
}

type PreparedDashLine = {
  engine: "dashscope";
  pcm: Uint8Array;
  sampleRate: number;
};

export type VoiceReadPreviewDownload = {
  blob: Blob;
  filename: string;
};

function concatArrayBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((s, p) => s + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), off);
    off += p.byteLength;
  }
  return out.buffer;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function pcm16leToWav(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}

function voiceReadPreviewFilename(
  settings: VoiceReadSettings,
  ext: string,
): string {
  const voice = settings.voiceId.trim() || "voice";
  const safe = voice.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 48);
  return `彩读试听-${safe}.${ext}`;
}

export class VoiceReadLinePlayer {
  /** 每一段（句）开始播放时回调，便于 UI 与「上/下一句」对齐 chunk 索引 */
  onChunkChange?: (index: number, total: number) => void;
  /** 当前播放路径正在等待 TTS 合成（非 warmLine 预取） */
  onSynthesizingChange?: (active: boolean) => void;

  /**
   * 仅 Edge：当前行切段与会话设置（无活跃 Edge 会话时为 null）。
   * 供后续从 `chunks.slice(fromIndex)` 重播剩余段，对齐 session segments。
   */
  getEdgeSpeakContext(): {
    chunks: readonly string[];
    settings: VoiceReadSettings;
  } | null {
    if (!this.edgeChunks.length || !this.edgeSettings) return null;
    return { chunks: [...this.edgeChunks], settings: this.edgeSettings };
  }

  private static readonly EDGE_BUFFER_SIZE = 4;

  private stopped = false;
  private playbackSynthesisDepth = 0;

  private prefetchKey: string | null = null;
  private prefetchPromise: Promise<PreparedDashLine> | null = null;
  private prefetchDashAbort: AbortController | null = null;
  private readonly edgeMp3Cache = new Map<string, ArrayBuffer>();
  private readonly edgeMp3Inflight = new Map<string, Promise<ArrayBuffer>>();
  private readonly dashPcmCache = new Map<string, PreparedDashLine>();
  private readonly dashPcmInflight = new Map<
    string,
    Promise<PreparedDashLine>
  >();
  /** 作废后：在途合成完成时不再写回缓存 */
  private readonly edgeSkipCacheKeys = new Set<string>();
  private readonly dashSkipCacheKeys = new Set<string>();

  /** Edge 会话 */
  private edgeFetchBuffer = new Map<number, Promise<ArrayBuffer>>();
  private edgeProducerIndex = 0;
  private edgeProducerWake: (() => void) | null = null;
  private edgeChunks: string[] = [];
  private edgeSettings: VoiceReadSettings | null = null;
  private edgeAudioCtx: AudioContext | null = null;
  private edgeGain: GainNode | null = null;
  private edgeScheduledEnd = 0;
  private edgeCheckTimer: ReturnType<typeof setInterval> | null = null;
  private edgeAllChunksDone = false;
  private edgeHasAudioData = false;
  private edgePlayingNotified = false;
  private edgeChunkStartTimers = new Set<ReturnType<typeof setTimeout>>();
  private edgePausedAt = 0;

  /** DashScope 会话 */
  private dashAudioCtx: AudioContext | null = null;
  private dashGain: GainNode | null = null;
  private dashScheduledEnd = 0;
  private dashAbort: AbortController | null = null;
  private dashCheckTimer: ReturnType<typeof setInterval> | null = null;
  private dashAllChunksDone = false;
  private dashHasAudioData = false;
  private dashChunkStartTimers = new Set<ReturnType<typeof setTimeout>>();
  private dashPausedAt = 0;
  private dashSessionSettings: VoiceReadSettings | null = null;

  isPaused(): boolean {
    if (this.edgeAudioCtx) return this.edgeAudioCtx.state === "suspended";
    if (this.dashAudioCtx) return this.dashAudioCtx.state === "suspended";
    if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
      return true;
    }
    return false;
  }

  pause(): void {
    if (this.edgeAudioCtx?.state === "running") {
      void this.edgeAudioCtx.suspend();
      this.edgePausedAt = Date.now();
      for (const t of this.edgeChunkStartTimers) clearTimeout(t);
      this.edgeChunkStartTimers.clear();
    }
    if (this.dashAudioCtx?.state === "running") {
      this.dashPausedAt = Date.now();
      for (const t of this.dashChunkStartTimers) clearTimeout(t);
      this.dashChunkStartTimers.clear();
    }
    void this.dashAudioCtx?.suspend();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }

  resume(): void {
    if (this.edgePausedAt > 0) {
      const pausedSec = (Date.now() - this.edgePausedAt) / 1000;
      this.edgeScheduledEnd += pausedSec;
      this.edgePausedAt = 0;
    }
    if (this.dashPausedAt > 0) {
      const pausedSec = (Date.now() - this.dashPausedAt) / 1000;
      this.dashScheduledEnd += pausedSec;
      this.dashPausedAt = 0;
    }
    void this.edgeAudioCtx?.resume();
    void this.dashAudioCtx?.resume();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }

  private cloneArrayBuffer(buf: ArrayBuffer): ArrayBuffer {
    return buf.slice(0);
  }

  private cloneDashPrepared(p: PreparedDashLine): PreparedDashLine {
    return {
      engine: "dashscope",
      pcm: p.pcm.slice(),
      sampleRate: p.sampleRate,
    };
  }

  private touchEdgeMp3Cache(key: string, data: ArrayBuffer): void {
    if (this.edgeMp3Cache.has(key)) this.edgeMp3Cache.delete(key);
    this.edgeMp3Cache.set(key, data);
    while (this.edgeMp3Cache.size > EDGE_MP3_CACHE_LIMIT) {
      const oldest = this.edgeMp3Cache.keys().next().value;
      if (oldest === undefined) break;
      this.edgeMp3Cache.delete(oldest);
    }
  }

  private touchDashPcmCache(key: string, data: PreparedDashLine): void {
    if (this.dashPcmCache.has(key)) this.dashPcmCache.delete(key);
    this.dashPcmCache.set(key, data);
    while (this.dashPcmCache.size > DASH_PCM_CACHE_LIMIT) {
      const oldest = this.dashPcmCache.keys().next().value;
      if (oldest === undefined) break;
      this.dashPcmCache.delete(oldest);
    }
  }

  /** 取 Edge MP3（命中缓存则立即返回副本，不删缓存项） */
  private setPlaybackSynthesizing(active: boolean): void {
    const prev = this.playbackSynthesisDepth > 0;
    if (active) {
      this.playbackSynthesisDepth += 1;
    } else {
      this.playbackSynthesisDepth = Math.max(
        0,
        this.playbackSynthesisDepth - 1,
      );
    }
    const now = this.playbackSynthesisDepth > 0;
    if (prev !== now) this.onSynthesizingChange?.(now);
  }

  private resetPlaybackSynthesizing(): void {
    if (this.playbackSynthesisDepth <= 0) return;
    this.playbackSynthesisDepth = 0;
    this.onSynthesizingChange?.(false);
  }

  private isEdgePlaybackCaughtUp(): boolean {
    if (this.stopped) return false;
    if (!this.edgeHasAudioData || !this.edgeAudioCtx) return true;
    if (this.edgeAudioCtx.state === "suspended") return false;
    return this.edgeAudioCtx.currentTime >= this.edgeScheduledEnd - 0.05;
  }

  private isDashPlaybackCaughtUp(): boolean {
    if (this.stopped) return false;
    if (!this.dashHasAudioData || !this.dashAudioCtx) return true;
    if (this.dashAudioCtx.state === "suspended") return false;
    return this.dashAudioCtx.currentTime >= this.dashScheduledEnd - 0.05;
  }

  /**
   * 仅在「时间线已播完排程、下一段仍未就绪」时亮合成 UI。
   * 边播边预合成、缓存命中、时间线仍有缓冲时不显示。
   */
  private async awaitWhenPlaybackBlocked<T>(
    playbackCaughtUp: () => boolean,
    work: Promise<T>,
  ): Promise<T> {
    if (this.stopped) throw new Error("aborted");

    let uiActive = false;
    const syncUi = () => {
      const want = playbackCaughtUp() && !this.stopped;
      if (want && !uiActive) {
        uiActive = true;
        this.setPlaybackSynthesizing(true);
      } else if (!want && uiActive) {
        uiActive = false;
        this.setPlaybackSynthesizing(false);
      }
    };

    try {
      while (true) {
        const raced = await Promise.race([
          work.then((v) => ({ kind: "done" as const, v })),
          sleepMs(80).then(() => ({ kind: "tick" as const })),
        ]);
        if (raced.kind === "done") return raced.v;
        if (this.stopped) throw new Error("aborted");
        syncUi();
      }
    } finally {
      if (uiActive) {
        uiActive = false;
        this.setPlaybackSynthesizing(false);
      }
    }
  }

  private invalidateEdgeChunkCache(
    settings: VoiceReadSettings,
    text: string,
  ): void {
    const k = chunkCacheKey(settings, text);
    this.edgeMp3Cache.delete(k);
    this.edgeMp3Inflight.delete(k);
  }

  /** 预取队列用：挂上 rejection 处理，避免 producer 先于 consumer await 时 Uncaught */
  private enqueueEdgeMp3Fetch(
    settings: VoiceReadSettings,
    text: string,
  ): Promise<ArrayBuffer> {
    const p = this.getEdgeMp3(settings, text);
    void p.catch(() => {});
    return p;
  }

  private async getEdgeMp3(
    settings: VoiceReadSettings,
    text: string,
  ): Promise<ArrayBuffer> {
    if (!hasVoiceReadSpeakableText(text)) {
      return Promise.reject(new Error("无可朗读内容"));
    }
    const k = chunkCacheKey(settings, text);
    const cached = this.edgeMp3Cache.get(k);
    if (cached) {
      if (!isEdgeMp3PayloadValid(cached)) {
        this.edgeMp3Cache.delete(k);
      } else {
        this.touchEdgeMp3Cache(k, cached);
        return this.cloneArrayBuffer(cached);
      }
    }
    const inflight = this.edgeMp3Inflight.get(k);
    if (inflight) return this.cloneArrayBuffer(await inflight);

    const request = this.fetchEdgeMp3(settings, text)
      .then((data) => {
        if (!isEdgeMp3PayloadValid(data)) {
          throw new Error("Edge TTS 返回无效音频");
        }
        const copy = this.cloneArrayBuffer(data);
        if (!this.edgeSkipCacheKeys.delete(k)) {
          this.touchEdgeMp3Cache(k, copy);
        }
        return copy;
      })
      .finally(() => {
        this.edgeMp3Inflight.delete(k);
      });
    this.edgeMp3Inflight.set(k, request);
    return this.cloneArrayBuffer(await request);
  }

  private async getDashChunkPrepared(
    settings: VoiceReadSettings,
    text: string,
    signal: AbortSignal,
  ): Promise<PreparedDashLine> {
    if (!hasVoiceReadSpeakableText(text)) {
      return Promise.reject(new Error("无可朗读内容"));
    }
    const k = chunkCacheKey(settings, text);
    const cached = this.dashPcmCache.get(k);
    if (cached) {
      this.touchDashPcmCache(k, cached);
      return this.cloneDashPrepared(cached);
    }
    const inflight = this.dashPcmInflight.get(k);
    if (inflight) return this.cloneDashPrepared(await inflight);

    const request = this.fetchDashScopePcm(settings, text, signal)
      .then((pcm) => {
        const prep: PreparedDashLine = {
          engine: "dashscope",
          pcm: pcm.slice(),
          sampleRate: DASH_PCM_SAMPLE_RATE,
        };
        if (!this.dashSkipCacheKeys.delete(k)) {
          this.touchDashPcmCache(k, prep);
        }
        return prep;
      })
      .finally(() => {
        this.dashPcmInflight.delete(k);
      });
    this.dashPcmInflight.set(k, request);
    return this.cloneDashPrepared(await request);
  }

  /** 仅清 DashScope 行级预取指针；合成结果缓存保留 */
  private discardDashPrefetchOnly(): void {
    this.prefetchKey = null;
    this.prefetchPromise = null;
    this.prefetchDashAbort?.abort();
    this.prefetchDashAbort = null;
  }

  discardPrefetch(): void {
    this.discardDashPrefetchOnly();
  }

  /** 换文件 / 换音色参数时清空（stop 与行跳转不清空） */
  clearSynthesisCache(): void {
    this.edgeMp3Cache.clear();
    this.edgeMp3Inflight.clear();
    this.dashPcmCache.clear();
    this.dashPcmInflight.clear();
    this.edgeSkipCacheKeys.clear();
    this.dashSkipCacheKeys.clear();
    this.discardDashPrefetchOnly();
  }

  /**
   * 作废当前行各切段缓存（「重新生成」用当前 effective 设置强制重拉 TTS）。
   * 在途请求返回时不会写回缓存。
   */
  invalidateLineSynthesis(settings: VoiceReadSettings, text: string): void {
    if (settings.engine === "system") return;
    const t = normalizeLineText(text);
    if (!t) return;

    const units =
      settings.engine === "edge"
        ? VOICE_READ_CHUNK_UNITS_EDGE
        : VOICE_READ_CHUNK_UNITS_DEFAULT;
    const chunks = splitVoiceReadChunks(t, units);
    const use = chunks.length > 0 ? chunks : [t];

    for (const c of use) {
      const k = chunkCacheKey(settings, c);
      this.edgeMp3Cache.delete(k);
      this.edgeMp3Inflight.delete(k);
      this.edgeSkipCacheKeys.add(k);
      this.dashPcmCache.delete(k);
      this.dashPcmInflight.delete(k);
      this.dashSkipCacheKeys.add(k);
    }

    const lineKey = lineCacheKey(settings, text);
    this.dashPcmCache.delete(lineKey);
    this.dashPcmInflight.delete(lineKey);
    this.dashSkipCacheKeys.add(lineKey);
    if (this.prefetchKey === lineKey) {
      this.discardDashPrefetchOnly();
    }
  }

  /** 预生成一行全部 Edge 段或 DashScope 段（供上一行/下一行跳转前 warm） */
  warmLine(settings: VoiceReadSettings, text: string): void {
    if (settings.engine === "system") return;
    const t = normalizeLineText(text);
    if (!t || !hasVoiceReadSpeakableText(t)) return;
    if (settings.engine === "dashscope") {
      const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT);
      for (const c of chunks.length > 0 ? chunks : [t]) {
        if (this.dashPcmCache.has(chunkCacheKey(settings, c))) continue;
        if (this.dashPcmInflight.has(chunkCacheKey(settings, c))) continue;
        const ac = new AbortController();
        void this.getDashChunkPrepared(settings, c, ac.signal).catch(() => {});
      }
      return;
    }
    const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_EDGE);
    for (const c of chunks.length > 0 ? chunks : [t]) {
      const k = chunkCacheKey(settings, c);
      if (this.edgeMp3Cache.has(k) || this.edgeMp3Inflight.has(k)) continue;
      void this.getEdgeMp3(settings, c).catch(() => {});
    }
  }

  /** 一行内所有切段是否均已合成进缓存（系统语音恒为 true） */
  isLineSynthesisCached(settings: VoiceReadSettings, text: string): boolean {
    if (settings.engine === "system") return true;
    const t = normalizeLineText(text);
    if (!t) return true;
    if (settings.engine === "dashscope") {
      const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT);
      const use = chunks.length > 0 ? chunks : [t];
      return use.every((c) =>
        this.dashPcmCache.has(chunkCacheKey(settings, c)),
      );
    }
    const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_EDGE);
    const use = chunks.length > 0 ? chunks : [t];
    return use.every((c) => this.edgeMp3Cache.has(chunkCacheKey(settings, c)));
  }

  /** 预取「下一行」：写入持久缓存，跳转命中则无需重新合成 */
  startPrefetch(settings: VoiceReadSettings, text: string): void {
    this.discardDashPrefetchOnly();
    this.warmLine(settings, text);
    if (settings.engine !== "dashscope") return;
    const t = normalizeLineText(text);
    if (!t) return;
    const key = lineCacheKey(settings, text);
    if (this.dashPcmCache.has(key) || this.dashPcmInflight.has(key)) return;
    this.prefetchDashAbort = new AbortController();
    this.prefetchKey = key;
    this.prefetchPromise = this.getDashChunkPrepared(
      settings,
      t,
      this.prefetchDashAbort.signal,
    );
  }

  stop(): void {
    this.stopped = true;
    this.discardPrefetch();
    this.abortActivePlayback();
  }

  /**
   * 暂停：中止当前 AudioContext，保留 Edge/Dash 合成缓存与进行中的预取。
   */
  pausePlayback(): void {
    this.stopped = true;
    this.resetPlaybackSynthesizing();
    this.discardDashPrefetchOnly();
    this.abortActivePlayback();
  }

  /**
   * 行内跳转时中止播放：保留 Edge 段缓存，仅取消 Dash 行级预取（`jumpToChunk` 前 stop）。
   */
  stopForLineJump(): void {
    this.stopped = true;
    this.discardDashPrefetchOnly();
    this.abortActivePlayback();
  }

  /**
   * 从指定段索引重播剩余段（`_sessionSegments.slice(index)` 后 `speak`）。
   */
  jumpToChunk(
    settings: VoiceReadSettings,
    chunks: string[],
    startIndex: number,
  ): Promise<void> {
    const parts = chunks
      .map((c) => normalizeLineText(c))
      .filter((c) => c.length > 0);
    if (parts.length === 0 || startIndex < 0 || startIndex >= parts.length) {
      return Promise.resolve();
    }
    const remaining = parts.slice(startIndex);
    this.abortActivePlayback();
    this.stopped = false;
    this.discardDashPrefetchOnly();
    if (settings.engine === "system") {
      return this.speakSystemChunks(settings, remaining);
    }
    if (settings.engine === "edge") {
      return this.speakEdgeChunks(settings, remaining);
    }
    return this.speakDashChunks(settings, remaining);
  }

  /**
   * 朗读已切好的多段（同一次会话）。后续「上一句 / 下一句」可只改 `chunks` 与起始索引重入。
   * 等待当前 Edge/Dash 时间线播完（连续朗读切批前调用，避免下一批过早 abort 造成听感重复）
   */
  async waitForPlaybackSettled(): Promise<void> {
    if (this.stopped) return;
    if (this.edgeAudioCtx && this.edgeHasAudioData) {
      await this.awaitEdgePlaybackDrain();
      return;
    }
    if (this.dashAudioCtx && this.dashHasAudioData) {
      await this.awaitDashPlaybackDrain();
    }
  }

  speakChunks(settings: VoiceReadSettings, chunks: string[]): Promise<void> {
    const parts = chunks
      .map((c) => normalizeLineText(c))
      .filter((c) => c.length > 0 && hasVoiceReadSpeakableText(c));
    if (parts.length === 0) return Promise.resolve();
    const use = parts;
    this.abortActivePlayback();
    this.stopped = false;
    if (settings.engine === "system") {
      return this.speakSystemChunks(settings, use);
    }
    if (settings.engine === "edge") {
      return this.speakEdgeChunks(settings, use);
    }
    return this.speakDashChunks(settings, use);
  }

  speakLine(settings: VoiceReadSettings, text: string): Promise<void> {
    const t = normalizeLineText(text);
    if (!t || !hasVoiceReadSpeakableText(t)) return Promise.resolve();

    const key = lineCacheKey(settings, text);
    let dashPrepared: Promise<PreparedDashLine> | null = null;
    if (settings.engine === "dashscope") {
      if (this.prefetchKey === key && this.prefetchPromise) {
        dashPrepared = this.prefetchPromise;
        this.prefetchKey = null;
        this.prefetchPromise = null;
      }
      this.discardDashPrefetchOnly();
    } else if (settings.engine === "edge") {
      this.discardDashPrefetchOnly();
    } else {
      this.discardDashPrefetchOnly();
    }

    this.abortActivePlayback();
    this.stopped = false;

    if (settings.engine === "system") {
      const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT);
      return this.speakSystemChunks(settings, chunks.length ? chunks : [" "]);
    }

    if (settings.engine === "dashscope" && dashPrepared) {
      const playPrepared = async (p: PreparedDashLine) => {
        if (this.stopped) return;
        await this.playDashSingleBuffer(settings, p.pcm, p.sampleRate);
      };
      const loadPrepared = this.dashPcmCache.has(key)
        ? dashPrepared
        : this.awaitWhenPlaybackBlocked(
            () => this.isDashPlaybackCaughtUp(),
            dashPrepared,
          );
      return loadPrepared.then(
        playPrepared,
        () =>
          this.speakDashChunks(
            settings,
            splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT),
          ),
      );
    }

    if (settings.engine === "edge") {
      const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_EDGE);
      return this.speakEdgeChunks(settings, chunks.length ? chunks : [" "]);
    }

    const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT);
    return this.speakDashChunks(settings, chunks.length ? chunks : [" "]);
  }

  private abortActivePlayback(): void {
    this.dashAbort?.abort();
    this.dashAbort = null;
    if (this.dashCheckTimer) {
      clearInterval(this.dashCheckTimer);
      this.dashCheckTimer = null;
    }
    for (const t of this.dashChunkStartTimers) clearTimeout(t);
    this.dashChunkStartTimers.clear();
    this.dashPausedAt = 0;
    if (this.dashAudioCtx) {
      void this.dashAudioCtx.close();
      this.dashAudioCtx = null;
    }
    this.dashGain = null;
    this.dashScheduledEnd = 0;

    if (this.edgeCheckTimer) {
      clearInterval(this.edgeCheckTimer);
      this.edgeCheckTimer = null;
    }
    for (const t of this.edgeChunkStartTimers) clearTimeout(t);
    this.edgeChunkStartTimers.clear();
    this.edgeFetchBuffer.clear();
    this.edgeProducerWake?.();
    this.edgeProducerWake = null;
    if (this.edgeAudioCtx) {
      void this.edgeAudioCtx.close();
      this.edgeAudioCtx = null;
    }
    this.edgeGain = null;
    this.edgeScheduledEnd = 0;
    this.edgeChunks = [];
    this.edgeSettings = null;
    this.dashSessionSettings = null;

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.resetPlaybackSynthesizing();
  }

  private async fetchEdgeMp3(
    settings: VoiceReadSettings,
    text: string,
  ): Promise<ArrayBuffer> {
    const req = toVoiceReadEdgeTtsRequest(settings, text);
    const r = await window.colorTxt.voiceReadEdgeTts(req);
    if (!r.ok) {
      throw new Error(r.error || "Edge 语音合成失败");
    }
    return r.mp3;
  }

  private async speakSystemChunks(
    settings: VoiceReadSettings,
    chunks: string[],
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) return;
      this.onChunkChange?.(i, chunks.length);
      await this.speakSystemOne(settings, chunks[i]!);
    }
  }

  private speakSystemOne(
    settings: VoiceReadSettings,
    text: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        reject(new Error("当前环境不支持系统语音"));
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = settings.rate;
      u.pitch = settings.pitch;
      const vid = settings.voiceId.trim();
      if (vid) {
        const v = window.speechSynthesis
          .getVoices()
          .find((x) => x.voiceURI === vid || x.name === vid);
        if (v) u.voice = v;
      }
      u.onend = () => {
        if (this.stopped) return;
        resolve();
      };
      u.onerror = (ev) => {
        if (this.stopped) return;
        if (ev.error === "canceled" || ev.error === "interrupted") {
          resolve();
          return;
        }
        reject(new Error(ev.error || "系统语音出错"));
      };
      window.speechSynthesis.speak(u);
    });
  }

  /** buffer 4 + producer + 时间线 decodeAndSchedule */
  private async speakEdgeChunks(
    settings: VoiceReadSettings,
    chunks: string[],
  ): Promise<void> {
    const BUFFER = VoiceReadLinePlayer.EDGE_BUFFER_SIZE;
    this.edgeChunks = chunks;
    this.edgeSettings = settings;
    this.edgeAllChunksDone = false;
    this.edgeHasAudioData = false;
    this.edgePlayingNotified = false;
    this.edgePausedAt = 0;
    this.edgeFetchBuffer.clear();
    this.edgeProducerIndex = 0;

    this.edgeAudioCtx = new AudioContext();
    this.edgeGain = this.edgeAudioCtx.createGain();
    this.edgeGain.connect(this.edgeAudioCtx.destination);
    this.edgeScheduledEnd = 0;

    if (this.edgeAudioCtx.state === "suspended") {
      await this.edgeAudioCtx.resume();
    }

    this.edgeCheckTimer = setInterval(() => {
      if (this.stopped) return;
      if (this.edgeAudioCtx?.state === "suspended") return;
      if (this.edgeAllChunksDone && this.edgeAudioCtx) {
        if (!this.edgeHasAudioData) {
          this.cleanupEdgeSession();
          return;
        }
        const ct = this.edgeAudioCtx.currentTime;
        if (ct >= this.edgeScheduledEnd - 0.05) {
          this.cleanupEdgeSession();
        }
      }
    }, 200);

    void this.runEdgeProducer(settings, chunks);

    const prewarm = Math.min(BUFFER, chunks.length);
    for (let p = 0; p < prewarm; p++) {
      if (this.stopped) return;
      const ch = chunks[p]!;
      this.edgeFetchBuffer.set(p, this.enqueueEdgeMp3Fetch(settings, ch));
      this.edgeProducerIndex = p + 1;
    }

    let edgeChunkError: unknown = null;
    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) break;
      const settings = this.edgeSettings;
      const ch = chunks[i];
      if (!settings || !ch) continue;
      try {
        await this.playEdgeChunkAtIndex(i, chunks.length, settings, ch);
      } catch (e) {
        if ((e as Error)?.message === "aborted") break;
        const msg = (e as Error)?.message ?? "";
        if (/无可朗读内容/.test(msg)) {
          this.edgeFetchBuffer.delete(i);
          this.edgeProducerWake?.();
          continue;
        }
        if (!edgeChunkError) edgeChunkError = e;
        throw e;
      }
      this.edgeFetchBuffer.delete(i);
      this.edgeProducerWake?.();
    }

    if (this.stopped) return;
    if (edgeChunkError && !this.edgeHasAudioData) {
      this.cleanupEdgeSession();
      throw edgeChunkError instanceof Error
        ? edgeChunkError
        : new Error(String(edgeChunkError));
    }
    this.edgeAllChunksDone = true;
    // 必须等本行实际播完再 resolve，否则连续朗读时下一行 `speakLine` 会立刻 abort 掉本行 AudioContext（试听只有一行故不易发现）
    await this.awaitEdgePlaybackDrain();
  }

  /** 等 Edge 时间线播放到 scheduledEnd（与 setInterval 清理条件一致） */
  private async awaitEdgePlaybackDrain(): Promise<void> {
    for (;;) {
      if (!this.edgeAudioCtx) return;
      if (this.stopped) return;
      const ctx = this.edgeAudioCtx;
      if (ctx.state === "suspended") {
        await sleepMs(50);
        continue;
      }
      if (this.edgeAllChunksDone && !this.edgeHasAudioData) {
        this.cleanupEdgeSession();
        return;
      }
      if (
        this.edgeAllChunksDone &&
        this.edgeHasAudioData &&
        ctx.currentTime >= this.edgeScheduledEnd - 0.05
      ) {
        this.cleanupEdgeSession();
        return;
      }
      await sleepMs(50);
    }
  }

  private async runEdgeProducer(
    settings: VoiceReadSettings,
    chunks: string[],
  ): Promise<void> {
    const BUFFER = VoiceReadLinePlayer.EDGE_BUFFER_SIZE;
    while (this.edgeProducerIndex < chunks.length) {
      if (this.stopped) return;
      while (this.edgeFetchBuffer.size >= BUFFER) {
        if (this.stopped) return;
        await new Promise<void>((resolve) => {
          this.edgeProducerWake = resolve;
        });
        this.edgeProducerWake = null;
      }
      if (this.stopped) return;
      const idx = this.edgeProducerIndex++;
      const ch = chunks[idx]!;
      this.edgeFetchBuffer.set(idx, this.enqueueEdgeMp3Fetch(settings, ch));
    }
  }

  private async waitEdgeChunk(index: number): Promise<ArrayBuffer> {
    while (!this.edgeFetchBuffer.has(index)) {
      if (this.stopped) throw new Error("aborted");
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    const promise = this.edgeFetchBuffer.get(index)!;
    const settings = this.edgeSettings;
    const ch = this.edgeChunks[index];
    if (
      settings &&
      ch &&
      this.edgeMp3Cache.has(chunkCacheKey(settings, ch))
    ) {
      return promise;
    }
    return this.awaitWhenPlaybackBlocked(
      () => this.isEdgePlaybackCaughtUp(),
      promise,
    );
  }

  /** 拉取并解码单段；合成/解码失败时作废缓存并重试（含主进程自动重试后仍失败） */
  private async playEdgeChunkAtIndex(
    index: number,
    total: number,
    settings: VoiceReadSettings,
    text: string,
  ): Promise<void> {
    if (!hasVoiceReadSpeakableText(text)) return;

    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.stopped) throw new Error("aborted");
      if (attempt > 0) {
        this.invalidateEdgeChunkCache(settings, text);
        await sleepMs(200 * attempt);
      }

      let buf: ArrayBuffer;
      try {
        buf =
          attempt === 0
            ? await this.waitEdgeChunk(index)
            : await this.getEdgeMp3(settings, text);
      } catch (e) {
        if ((e as Error)?.message === "aborted") throw e;
        if (/无可朗读内容/.test((e as Error)?.message ?? "")) return;
        if (attempt < maxAttempts - 1) continue;
        throw e;
      }

      if (this.stopped) throw new Error("aborted");
      if (!isEdgeMp3PayloadValid(buf)) {
        this.invalidateEdgeChunkCache(settings, text);
        if (attempt < maxAttempts - 1) continue;
        throw new Error("Edge TTS 返回无效音频");
      }

      try {
        await this.edgeDecodeAndSchedule(buf, index, total);
        return;
      } catch (e) {
        if (isDecodeAudioDataEncodingError(e) && attempt < maxAttempts - 1) {
          this.invalidateEdgeChunkCache(settings, text);
          continue;
        }
        throw e;
      }
    }
  }

  private async edgeDecodeAndSchedule(
    mp3Data: ArrayBuffer,
    index: number,
    total: number,
  ): Promise<void> {
    if (!this.edgeAudioCtx || !this.edgeGain || this.stopped) return;
    if (!isEdgeMp3PayloadValid(mp3Data)) {
      throw new Error("Edge TTS 音频无效");
    }

    const audioBuffer = await this.edgeAudioCtx.decodeAudioData(
      mp3Data.slice(0),
    );
    if (!this.edgeAudioCtx || !this.edgeGain || this.stopped) return;

    const ctx = this.edgeAudioCtx;
    const gain = this.edgeGain;
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(gain);

    const startAt = Math.max(ctx.currentTime, this.edgeScheduledEnd);
    const notify = () => {
      if (this.stopped) return;
      this.onChunkChange?.(index, total);
    };
    const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
    if (delayMs <= 16) {
      notify();
    } else {
      const timer = setTimeout(() => {
        this.edgeChunkStartTimers.delete(timer);
        notify();
      }, delayMs);
      this.edgeChunkStartTimers.add(timer);
    }
    src.start(startAt);
    this.edgeScheduledEnd = startAt + audioBuffer.duration;
    this.edgeHasAudioData = true;

    if (!this.edgePlayingNotified) {
      this.edgePlayingNotified = true;
    }
  }

  private cleanupEdgeSession(): void {
    if (this.edgeCheckTimer) {
      clearInterval(this.edgeCheckTimer);
      this.edgeCheckTimer = null;
    }
    for (const t of this.edgeChunkStartTimers) clearTimeout(t);
    this.edgeChunkStartTimers.clear();
    if (this.edgeAudioCtx) {
      void this.edgeAudioCtx.close();
      this.edgeAudioCtx = null;
    }
    this.edgeGain = null;
    this.edgeScheduledEnd = 0;
    this.edgeFetchBuffer.clear();
    this.edgeProducerWake?.();
    this.edgeProducerWake = null;
    this.edgeChunks = [];
    this.edgeSettings = null;
  }

  /** DashScope：流式 + scheduleFlush 排时间线 */
  private async speakDashChunks(
    settings: VoiceReadSettings,
    chunks: string[],
  ): Promise<void> {
    this.dashSessionSettings = settings;
    this.dashAbort = new AbortController();
    const sessionSignal = this.dashAbort.signal;
    this.dashAllChunksDone = false;
    this.dashHasAudioData = false;

    this.dashAudioCtx = new AudioContext();
    this.dashGain = this.dashAudioCtx.createGain();
    this.dashGain.connect(this.dashAudioCtx.destination);
    this.dashScheduledEnd = 0;

    if (this.dashAudioCtx.state === "suspended") {
      await this.dashAudioCtx.resume();
    }

    this.dashCheckTimer = setInterval(() => {
      if (this.stopped) return;
      if (this.dashAudioCtx?.state === "suspended") return;
      if (this.dashAllChunksDone && this.dashAudioCtx) {
        if (!this.dashHasAudioData) {
          this.cleanupDashSession();
          return;
        }
        const ct = this.dashAudioCtx.currentTime;
        if (ct >= this.dashScheduledEnd - 0.05) {
          this.cleanupDashSession();
        }
      }
    }, 200);

    let dashChunkError: unknown = null;
    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) break;
      try {
        await this.dashStreamChunk(
          settings,
          chunks[i]!,
          i,
          chunks.length,
          sessionSignal,
        );
      } catch (err) {
        if ((err as Error)?.message === "aborted" || sessionSignal.aborted) {
          break;
        }
        if (!dashChunkError) dashChunkError = err;
        console.error("[VoiceRead DashScope] chunk error:", err);
      }
    }

    if (this.stopped) return;
    this.dashAllChunksDone = true;
    if (dashChunkError && !this.dashHasAudioData) {
      this.cleanupDashSession();
      throw dashChunkError instanceof Error
        ? dashChunkError
        : new Error(String(dashChunkError));
    }
    await this.awaitDashPlaybackDrain();
  }

  /** 等 Dash 排播时间线播放到 scheduledEnd */
  private async awaitDashPlaybackDrain(): Promise<void> {
    for (;;) {
      if (!this.dashAudioCtx) return;
      if (this.stopped) return;
      const ctx = this.dashAudioCtx;
      if (ctx.state === "suspended") {
        await sleepMs(50);
        continue;
      }
      if (this.dashAllChunksDone && !this.dashHasAudioData) {
        this.cleanupDashSession();
        return;
      }
      if (
        this.dashAllChunksDone &&
        this.dashHasAudioData &&
        ctx.currentTime >= this.dashScheduledEnd - 0.05
      ) {
        this.cleanupDashSession();
        return;
      }
      await sleepMs(50);
    }
  }

  private async dashStreamChunk(
    settings: VoiceReadSettings,
    text: string,
    index: number,
    total: number,
    signal: AbortSignal,
  ): Promise<void> {
    const fetchPrepared = this.getDashChunkPrepared(settings, text, signal);
    const prepared = this.dashPcmCache.has(chunkCacheKey(settings, text))
      ? await fetchPrepared
      : await this.awaitWhenPlaybackBlocked(
          () => this.isDashPlaybackCaughtUp(),
          fetchPrepared,
        );
    if (this.stopped || signal.aborted) return;
    this.scheduleDashChunkPlayback(prepared.pcm, index, total);
  }

  /** 与 Edge 一致：在排播时间线 startAt 触发 onChunkChange，而非合成开始时 */
  private scheduleDashChunkNotify(
    index: number,
    total: number,
    startAt: number,
    ctx: AudioContext,
  ): void {
    const notify = () => {
      if (this.stopped) return;
      this.onChunkChange?.(index, total);
    };
    const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
    if (delayMs <= 16) {
      notify();
      return;
    }
    const timer = setTimeout(() => {
      this.dashChunkStartTimers.delete(timer);
      notify();
    }, delayMs);
    this.dashChunkStartTimers.add(timer);
  }

  private scheduleDashChunkPlayback(
    pcm: Uint8Array,
    index: number,
    total: number,
  ): void {
    if (!this.dashAudioCtx || !this.dashGain || this.stopped) return;

    const numSamples = Math.floor(pcm.length / 2);
    if (numSamples === 0) return;

    const ctx = this.dashAudioCtx;
    const gain = this.dashGain;
    const audioBuffer = ctx.createBuffer(1, numSamples, DASH_PCM_SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    const s = this.dashSessionSettings;
    src.playbackRate.value = Math.max(0.5, Math.min(2, s?.rate ?? 1));
    src.connect(gain);

    const startAt = Math.max(ctx.currentTime, this.dashScheduledEnd);
    this.scheduleDashChunkNotify(index, total, startAt, ctx);
    src.start(startAt);
    this.dashScheduledEnd =
      startAt + audioBuffer.duration / src.playbackRate.value;
    this.dashHasAudioData = true;
  }

  private cleanupDashSession(): void {
    if (this.dashCheckTimer) {
      clearInterval(this.dashCheckTimer);
      this.dashCheckTimer = null;
    }
    for (const t of this.dashChunkStartTimers) clearTimeout(t);
    this.dashChunkStartTimers.clear();
    this.dashPausedAt = 0;
    if (this.dashAudioCtx) {
      void this.dashAudioCtx.close();
      this.dashAudioCtx = null;
    }
    this.dashGain = null;
    this.dashScheduledEnd = 0;
    this.dashSessionSettings = null;
  }

  /** 预取命中：整行 PCM 一次排进时间线（无切段 SSE） */
  private async playDashSingleBuffer(
    settings: VoiceReadSettings,
    pcm: Uint8Array,
    sampleRate: number,
  ): Promise<void> {
    if (this.stopped) return;
    this.dashAudioCtx = new AudioContext();
    this.dashGain = this.dashAudioCtx.createGain();
    this.dashGain.connect(this.dashAudioCtx.destination);
    this.dashScheduledEnd = 0;

    if (this.dashAudioCtx.state === "suspended") {
      await this.dashAudioCtx.resume();
    }

    const numSamples = Math.floor(pcm.length / 2);
    if (numSamples === 0) throw new Error("通义语音合成返回的音频数据无效");

    const ctx = this.dashAudioCtx;
    const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.playbackRate.value = Math.max(0.5, Math.min(2, settings.rate));
    src.connect(this.dashGain!);

    await new Promise<void>((resolve, reject) => {
      src.onended = () => {
        if (!this.stopped) resolve();
      };
      try {
        const startAt = Math.max(ctx.currentTime, this.dashScheduledEnd);
        this.scheduleDashChunkNotify(0, 1, startAt, ctx);
        src.start(startAt);
        this.dashScheduledEnd =
          startAt + audioBuffer.duration / src.playbackRate.value;
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    if (this.dashAudioCtx) {
      void this.dashAudioCtx.close();
      this.dashAudioCtx = null;
    }
    this.dashGain = null;
  }

  private async fetchDashScopePcm(
    settings: VoiceReadSettings,
    text: string,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const key = settings.dashscopeApiKey.trim();
    if (!key) {
      throw new Error(
        "请先在「语音朗读」设置中填写阿里云通义（DashScope）API 密钥",
      );
    }
    const voice = settings.voiceId.trim() || "Cherry";

    const resp = await fetch(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "X-DashScope-SSE": "enable",
        },
        body: JSON.stringify({
          model: "qwen3-tts-flash",
          input: { text, voice },
        }),
        signal,
      },
    );
    if (!resp.ok) {
      throw new Error(`通义语音合成 HTTP ${resp.status}`);
    }
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("无响应体");

    const chunks: Uint8Array[] = [];
    const dec = new TextDecoder();
    let buf = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const evt = JSON.parse(jsonStr) as {
            output?: { audio?: { data?: string } };
          };
          const b64 = evt?.output?.audio?.data;
          if (b64 && typeof b64 === "string") {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
            chunks.push(bytes);
          }
        } catch {
          // skip
        }
      }
    }
    if (signal.aborted) {
      throw new Error("interrupted");
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    if (totalLen === 0) {
      throw new Error("通义语音合成未返回音频数据");
    }
    const merged = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    return merged;
  }

  /**
   * 从试听合成缓存拼出可下载文件（Edge：MP3；DashScope：WAV；系统语音不支持）。
   */
  async buildLineDownloadable(
    settings: VoiceReadSettings,
    text: string,
  ): Promise<VoiceReadPreviewDownload | null> {
    const t = normalizeLineText(text);
    if (!t || settings.engine === "system") return null;

    if (settings.engine === "edge") {
      const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_EDGE);
      const use = chunks.length > 0 ? chunks : [t];
      const parts: ArrayBuffer[] = [];
      for (const c of use) {
        const buf = await this.getEdgeMp3(settings, c);
        if (!buf.byteLength) return null;
        parts.push(buf);
      }
      return {
        blob: new Blob([concatArrayBuffers(parts)], { type: "audio/mpeg" }),
        filename: voiceReadPreviewFilename(settings, "mp3"),
      };
    }

    const chunks = splitVoiceReadChunks(t, VOICE_READ_CHUNK_UNITS_DEFAULT);
    const use = chunks.length > 0 ? chunks : [t];
    const signal = new AbortController().signal;
    const pcmParts: Uint8Array[] = [];
    let sampleRate = DASH_PCM_SAMPLE_RATE;
    for (const c of use) {
      const prep = await this.getDashChunkPrepared(settings, c, signal);
      pcmParts.push(prep.pcm);
      sampleRate = prep.sampleRate;
    }
    const pcm = concatUint8Arrays(pcmParts);
    if (!pcm.length) return null;
    return {
      blob: new Blob([pcm16leToWav(pcm, sampleRate)], { type: "audio/wav" }),
      filename: voiceReadPreviewFilename(settings, "wav"),
    };
  }
}
