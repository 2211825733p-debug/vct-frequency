/**
 * A small Web Audio engine built for six 30-second anthems.
 *
 * - pre-fetches the six preview files
 * - decodes on demand, with a priority path for the opening signal
 * - equal-power crossfades between years
 * - exposes real waveform peaks for the transport
 * - feeds a single analyser to the emblem and the ambient field
 */

const AudioCtor = window.AudioContext || window.webkitAudioContext;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const computePeaks = (buffer, count = 220) => {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / count));
  const peaks = new Float32Array(count);
  let maxPeak = 0.0001;

  for (let i = 0; i < count; i += 1) {
    const start = i * block;
    const end = Math.min(start + block, channel.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      sum += channel[j] * channel[j];
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    peaks[i] = rms;
    if (rms > maxPeak) maxPeak = rms;
  }

  for (let i = 0; i < count; i += 1) {
    peaks[i] = clamp(peaks[i] / maxPeak, 0.025, 1);
  }

  return peaks;
};

export class AnthemAudio {
  constructor({ tracks, onProgress, onState, onError } = {}) {
    this.tracks = tracks;
    this.onProgress = onProgress || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});

    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.frequencyData = null;
    this.rawTracks = new Map();
    this.rawPromises = new Map();
    this.buffers = new Map();
    this.bufferPromises = new Map();
    this.peaks = new Map();

    this.currentIndex = tracks.length - 1;
    this.source = null;
    this.sourceGain = null;
    this.startedAt = 0;
    this.offset = 0;
    this.playing = false;
    this.volume = 0.72;
    this.muted = false;
    this.requestId = 0;
    this.readyCount = 0;
    this.failedCount = 0;
    this.prefetchStarted = false;
  }

  async prefetchRaw() {
    if (this.prefetchStarted) return;
    this.prefetchStarted = true;

    const total = this.tracks.length;
    this.onProgress({ loaded: 0, total, failed: 0 });

    await Promise.allSettled(
      this.tracks.map(async (track) => {
        try {
          await this.fetchRaw(track);
          this.readyCount += 1;
        } catch (error) {
          this.failedCount += 1;
          console.warn(`[VCT] Could not preload ${track.title}`, error);
        }
        this.onProgress({
          loaded: this.readyCount,
          total,
          failed: this.failedCount
        });
      })
    );
  }

  async fetchRaw(track) {
    if (this.rawTracks.has(track.id)) return this.rawTracks.get(track.id);
    if (this.rawPromises.has(track.id)) return this.rawPromises.get(track.id);

    const promise = fetch(track.audio, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Audio request failed with ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        this.rawTracks.set(track.id, buffer);
        this.rawPromises.delete(track.id);
        return buffer;
      })
      .catch((error) => {
        this.rawPromises.delete(track.id);
        throw error;
      });

    this.rawPromises.set(track.id, promise);
    return promise;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    if (!AudioCtor) {
      throw new Error('Web Audio is unavailable in this browser.');
    }

    this.ctx = new AudioCtor({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -12;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;

    this.master.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async ensureBuffer(index) {
    const track = this.tracks[index];
    if (!track) throw new Error(`Unknown track index: ${index}`);

    if (this.buffers.has(track.id)) return this.buffers.get(track.id);
    if (this.bufferPromises.has(track.id)) return this.bufferPromises.get(track.id);

    const promise = (async () => {
      const raw = await this.fetchRaw(track);
      if (!this.ctx) await this.init();

      const buffer = await this.ctx.decodeAudioData(raw.slice(0));
      this.buffers.set(track.id, buffer);
      this.peaks.set(track.id, computePeaks(buffer));
      this.bufferPromises.delete(track.id);
      return buffer;
    })().catch((error) => {
      this.bufferPromises.delete(track.id);
      throw error;
    });

    this.bufferPromises.set(track.id, promise);
    return promise;
  }

  async preload(index) {
    await this.ensureBuffer(index);
    return this.peaks.get(this.tracks[index].id);
  }

  preloadAll() {
    return Promise.allSettled(
      this.tracks.map((_, index) => this.ensureBuffer(index))
    );
  }

  async play(index, { offset = 0, fade = 0.65, restart = false } = {}) {
    if (!this.ctx) await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const request = ++this.requestId;
    const track = this.tracks[index];
    const buffer = await this.ensureBuffer(index);

    // A newer selection won the race while this buffer was decoding.
    if (request !== this.requestId) return null;

    const startAt = restart ? 0 : clamp(offset, 0, Math.max(0, buffer.duration - 0.04));
    const now = this.ctx.currentTime;
    const nextSource = this.ctx.createBufferSource();
    const nextGain = this.ctx.createGain();

    nextSource.buffer = buffer;
    nextSource.loop = true;
    nextGain.gain.setValueAtTime(0.0001, now);
    nextGain.gain.exponentialRampToValueAtTime(1, now + fade);
    nextSource.connect(nextGain);
    nextGain.connect(this.master);

    const previousSource = this.source;
    const previousGain = this.sourceGain;

    if (previousSource && previousGain) {
      previousGain.gain.cancelScheduledValues(now);
      previousGain.gain.setValueAtTime(Math.max(previousGain.gain.value, 0.0001), now);
      previousGain.gain.exponentialRampToValueAtTime(0.0001, now + fade * 0.85);
      try {
        previousSource.stop(now + fade + 0.08);
      } catch {
        /* The source may already have been stopped by a fast double-click. */
      }
    }

    nextSource.start(now, startAt);

    this.currentIndex = index;
    this.source = nextSource;
    this.sourceGain = nextGain;
    this.startedAt = now - startAt;
    this.offset = startAt;
    this.playing = true;
    this.onState('playing', track);
    return this.peaks.get(track.id);
  }

  pause() {
    if (!this.ctx || !this.playing) return;

    const now = this.ctx.currentTime;
    this.offset = this.getPosition();

    if (this.sourceGain) {
      this.sourceGain.gain.cancelScheduledValues(now);
      this.sourceGain.gain.setValueAtTime(Math.max(this.sourceGain.gain.value, 0.0001), now);
      this.sourceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    }

    const source = this.source;
    const gain = this.sourceGain;
    if (source) {
      try {
        source.stop(now + 0.18);
      } catch {
        /* Already stopped. */
      }
    }

    this.source = null;
    this.sourceGain = null;
    this.playing = false;
    this.onState('paused', this.tracks[this.currentIndex]);

    window.setTimeout(() => {
      if (gain) gain.disconnect();
    }, 260);
  }

  async toggle() {
    if (this.playing) {
      this.pause();
      return false;
    }

    await this.play(this.currentIndex, { offset: this.offset, fade: 0.25 });
    return true;
  }

  async seek(seconds) {
    const track = this.tracks[this.currentIndex];
    const buffer = this.buffers.get(track.id);
    const duration = buffer ? buffer.duration : track.duration;
    const nextOffset = clamp(seconds, 0, Math.max(0, duration - 0.04));
    this.offset = nextOffset;

    if (!this.playing) return nextOffset;

    // Restart at the new position with a micro fade so scrubbing stays clean.
    await this.play(this.currentIndex, {
      offset: nextOffset,
      fade: 0.06,
      restart: false
    });
    return nextOffset;
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0.0001 : Math.max(0.0001, this.volume);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, 0.02);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0.0001 : Math.max(0.0001, this.volume);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, 0.02);
  }

  getPosition() {
    if (!this.ctx || !this.playing) return this.offset;
    const buffer = this.buffers.get(this.tracks[this.currentIndex].id);
    if (!buffer) return this.offset;
    const elapsed = this.ctx.currentTime - this.startedAt;
    return ((elapsed % buffer.duration) + buffer.duration) % buffer.duration;
  }

  getDuration() {
    const buffer = this.buffers.get(this.tracks[this.currentIndex].id);
    return buffer ? buffer.duration : this.tracks[this.currentIndex].duration;
  }

  getPeaks(index = this.currentIndex) {
    return this.peaks.get(this.tracks[index].id) || null;
  }

  getLevels() {
    if (!this.analyser || !this.playing) {
      return { bass: 0, mid: 0, high: 0, energy: 0 };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    const data = this.frequencyData;
    const length = data.length;
    const bassEnd = Math.max(1, Math.floor(length * 0.08));
    const midEnd = Math.max(bassEnd + 1, Math.floor(length * 0.36));

    let bass = 0;
    let mid = 0;
    let high = 0;

    for (let i = 0; i < bassEnd; i += 1) bass += data[i];
    for (let i = bassEnd; i < midEnd; i += 1) mid += data[i];
    for (let i = midEnd; i < length; i += 1) high += data[i];

    bass = bass / (bassEnd * 255);
    mid = mid / ((midEnd - bassEnd) * 255);
    high = high / ((length - midEnd) * 255);
    const energy = bass * 0.55 + mid * 0.33 + high * 0.12;

    return { bass, mid, high, energy };
  }

  destroy() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* noop */
      }
    }
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.playing = false;
  }
}
