import { Injectable } from '@angular/core';
import { HassService } from './hass.service';
import { DashboardApiService } from './dashboard-api.service';

@Injectable({ providedIn: 'root' })
export class CameraPlaybackService {
  constructor(private readonly hass: HassService, private readonly api: DashboardApiService) {}

  async getStreamUrl(entityId: string): Promise<string> {
    const stream = await this.hass.getCameraHlsStream(entityId);
    return this.api.cameraHlsProxyUrl(stream.url);
  }

  async attach(video: HTMLVideoElement, url: string, onFatal: () => void, signal: AbortSignal, lowLatency: boolean): Promise<() => void> {
    if (signal.aborted) throw new DOMException('Playback cancelled', 'AbortError');
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      void video.play().catch(() => {});
      return () => { video.pause(); video.removeAttribute('src'); video.load(); };
    }
    const { default: Hls } = await import('hls.js');
    if (signal.aborted) throw new DOMException('Playback cancelled', 'AbortError');
    if (!Hls.isSupported()) throw new Error('HLS video is not supported.');
    const hls = new Hls({ lowLatencyMode: lowLatency, backBufferLength: 10, maxBufferLength: 10, maxMaxBufferLength: 20 });
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) onFatal(); });
    hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => {}); });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => hls.destroy();
  }
}
