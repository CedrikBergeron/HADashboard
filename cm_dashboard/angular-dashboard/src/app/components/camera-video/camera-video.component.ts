import { Component, ElementRef, HostBinding, Input, OnChanges, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CameraPlaybackService } from '../../service/camera-playback.service';

@Component({
  selector: 'app-camera-video', standalone: true,
  template: `
    <video #video autoplay [muted]="true" playsinline preload="auto" [controls]="false" [attr.aria-label]="label"
      [style.object-fit]="fit" (playing)="onPlaying()" (waiting)="onWaiting()" (error)="onVideoError()"></video>
    @if (state === 'loading') { <div class="video-loading" role="status"><span class="video-spinner"></span><span>Connexion au flux vidéo…</span></div> }
    @if (state === 'error') { <div class="camera-video-error" role="status"><span class="material-symbols-outlined">videocam_off</span><span>Flux vidéo indisponible</span><button type="button" (click)="$event.stopPropagation(); start(true)">Réessayer</button></div> }
  `,
  styles: [`
    :host { display:block; position:relative; width:100%; height:100%; background:#090b0d; }
    video { display:block; width:100%; height:100%; }
    .video-loading,.camera-video-error { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:12px; color:rgba(255,255,255,.65); font:inherit; font-size:.7rem; text-align:center; }
    .video-loading { pointer-events:none; }
    .video-spinner { width:18px; height:18px; border:1px solid rgba(255,255,255,.15); border-top-color:rgba(255,255,255,.7); border-radius:50%; animation:videoSpin 1.3s linear infinite; }
    .camera-video-error { background:#101214; }
    button { position:relative; z-index:3; min-height:36px; padding:0 12px; border:1px solid rgba(255,255,255,.15); border-radius:9px; background:rgba(255,255,255,.06); color:#fff; font:inherit; cursor:pointer; }
    @keyframes videoSpin { to { transform:rotate(360deg); } }
    @media(prefers-reduced-motion:reduce) { .video-spinner { animation:none; } }
  `]
})
export class CameraVideoComponent implements OnInit, OnChanges, OnDestroy {
  @Input() entityId = '';
  @Input() label = '';
  @Input() fit: 'cover' | 'contain' = 'cover';
  @Input() lowLatency = false;
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @HostBinding('attr.data-transport') transport: 'webrtc' | 'hls' | null = null;
  state: 'loading' | 'playing' | 'error' = 'loading';
  private initialized = false;
  private generation = 0;
  private controller?: AbortController;
  private cleanup?: () => void;

  constructor(private readonly playback: CameraPlaybackService, readonly element: ElementRef<HTMLElement>) {}
  ngOnInit(): void { this.initialized = true; void this.start(); }
  ngOnChanges(): void { if (this.initialized) void this.start(); }
  ngOnDestroy(): void { this.stop(); }

  async start(refresh = false, hlsOnly = false): Promise<void> {
    this.stop();
    const generation = this.generation;
    const controller = this.controller = new AbortController();
    this.state = 'loading';
    try {
      if (!hlsOnly) {
        try {
          const cleanup = await this.playback.attachWebRtc(this.video.nativeElement, this.entityId, () => {
            if (generation === this.generation && !controller.signal.aborted) void this.start(true, true);
          }, controller.signal);
          if (controller.signal.aborted || generation !== this.generation) cleanup();
          else { this.cleanup = cleanup; this.transport = 'webrtc'; }
          return;
        } catch { if (controller.signal.aborted || generation !== this.generation) return; }
      }
      const url = await (refresh ? this.playback.getStreamUrl(this.entityId, true) : this.playback.getStreamUrl(this.entityId));
      if (controller.signal.aborted || generation !== this.generation) return;
      const cleanup = await this.playback.attach(this.video.nativeElement, url, () => this.fail(generation), controller.signal, this.lowLatency);
      if (controller.signal.aborted || generation !== this.generation) cleanup();
      else { this.cleanup = cleanup; this.transport = 'hls'; }
    } catch { if (!controller.signal.aborted && generation === this.generation) this.fail(generation); }
  }

  stop(): void {
    this.generation++;
    this.transport = null;
    this.controller?.abort();
    this.cleanup?.();
    this.cleanup = undefined;
    const video = this.video?.nativeElement;
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  }
  onPlaying(): void { if (this.controller && !this.controller.signal.aborted) this.state = 'playing'; }
  onVideoError(): void { if (this.controller && !this.controller.signal.aborted) this.fail(this.generation); }
  onWaiting(): void { if (this.controller && !this.controller.signal.aborted && this.state !== 'error') this.state = 'loading'; }
  private fail(generation: number): void { if (generation === this.generation) { this.stop(); this.state = 'error'; } }
}
