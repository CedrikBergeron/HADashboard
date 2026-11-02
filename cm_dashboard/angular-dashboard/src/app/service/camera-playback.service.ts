import { Injectable } from '@angular/core';
import { CameraWebRtcPlayer } from './camera-webrtc';
import { HassService } from './hass.service';
import { DashboardApiService } from './dashboard-api.service';

@Injectable({ providedIn: 'root' })
export class CameraPlaybackService {
  private readonly webRtc: CameraWebRtcPlayer;
  constructor(private readonly hass: HassService, private readonly api: DashboardApiService) { this.webRtc = new CameraWebRtcPlayer(hass); }

  attachWebRtc(video: HTMLVideoElement, entityId: string, onFatal: () => void, signal: AbortSignal): Promise<() => void> {
    this.configureVideo(video);
    return this.webRtc.attach(video, entityId, onFatal, signal);
  }

  private configureVideo(video: HTMLVideoElement): void {
    video.autoplay = true; video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.controls = false; video.preload = 'auto';
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  }

  private readonly streams = new Map<string, { expires: number; promise: Promise<string> }>();
  private library?: Promise<typeof import('hls.js')>;

  private prepareLibrary(): Promise<typeof import('hls.js')> {
    return this.library ??= import('hls.js').catch((error) => { this.library = undefined; throw error; });
  }

  getStreamUrl(entityId: string, refresh = false): Promise<string> {
    // Download the player in parallel with stream negotiation, rather than afterwards.
    if (!document.createElement('video').canPlayType('application/vnd.apple.mpegurl')) void this.prepareLibrary().catch(() => {});
    const cached = this.streams.get(entityId);
    if (!refresh && cached && cached.expires > Date.now()) return cached.promise;
    const promise = this.hass.getCameraHlsStream(entityId).then((stream) => this.api.cameraHlsProxyUrl(stream.url)).catch((error) => {
      if (this.streams.get(entityId)?.promise === promise) this.streams.delete(entityId);
      throw error;
    });
    if (this.streams.size >= 64) this.streams.delete(this.streams.keys().next().value!);
    this.streams.set(entityId, { expires: Date.now() + 15000, promise });
    return promise;
  }

  async attach(video: HTMLVideoElement, url: string, onFatal: () => void, signal: AbortSignal, lowLatency: boolean): Promise<() => void> {
    if (signal.aborted) throw new DOMException('Playback cancelled', 'AbortError');
    this.configureVideo(video);
    const play = () => {
      if (signal.aborted || !video.paused) return;
      void video.play().catch((error) => { if (!signal.aborted && error?.name === 'NotAllowedError') onFatal(); });
    };
    video.addEventListener('canplay', play);
    const detach = () => video.removeEventListener('canplay', play);
    signal.addEventListener('abort', detach, { once: true });
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      play();
      return () => { detach(); signal.removeEventListener('abort', detach); video.pause(); video.removeAttribute('src'); video.load(); };
    }
    const { default: Hls } = await this.prepareLibrary();
    if (signal.aborted) throw new DOMException('Playback cancelled', 'AbortError');
    if (!Hls.isSupported()) { detach(); signal.removeEventListener('abort', detach); throw new Error('HLS video is not supported.'); }
    const hls = new Hls({ lowLatencyMode: lowLatency, backBufferLength: 10, maxBufferLength: 4, maxMaxBufferLength: 8 });
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) onFatal(); });
    hls.on(Hls.Events.MANIFEST_PARSED, play);
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => { detach(); signal.removeEventListener('abort', detach); hls.destroy(); };
  }
}
