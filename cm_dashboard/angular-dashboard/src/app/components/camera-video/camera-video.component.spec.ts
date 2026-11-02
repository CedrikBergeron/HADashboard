import { TestBed } from '@angular/core/testing';
import { CameraVideoComponent } from './camera-video.component';
import { CameraPlaybackService } from '../../service/camera-playback.service';

describe('Camera video lifecycle', () => {
  it('ignores a playlist that arrives after the player has closed', async () => {
    let resolve!: (url: string) => void;
    const playback = { getStreamUrl: () => new Promise<string>((done) => resolve = done), attach: jasmine.createSpy() };
    TestBed.configureTestingModule({ imports: [CameraVideoComponent], providers: [{ provide: CameraPlaybackService, useValue: playback }] });
    const fixture = TestBed.createComponent(CameraVideoComponent);
    fixture.componentRef.setInput('entityId', 'camera.front'); fixture.detectChanges();
    fixture.componentInstance.stop(); resolve('/api/home-assistant/hls/late.m3u8');
    await fixture.whenStable();
    expect(playback.attach).not.toHaveBeenCalled(); fixture.destroy();
  });

  it('disposes the player and aborts pending work on destroy', async () => {
    const cleanup = jasmine.createSpy('cleanup');
    let signal!: AbortSignal;
    const playback = { getStreamUrl: async () => '/playlist.m3u8', attach: async (_video: HTMLVideoElement, _url: string, _error: () => void, nextSignal: AbortSignal) => { signal = nextSignal; return cleanup; } };
    TestBed.configureTestingModule({ imports: [CameraVideoComponent], providers: [{ provide: CameraPlaybackService, useValue: playback }] });
    const fixture = TestBed.createComponent(CameraVideoComponent);
    fixture.componentRef.setInput('entityId', 'camera.high'); fixture.detectChanges(); await fixture.whenStable();
    fixture.destroy(); expect(cleanup).toHaveBeenCalled(); expect(signal.aborted).toBeTrue();
  });
});


describe('Preferred camera transport', () => {
  it('prefers WebRTC and switches to HLS if the established peer fails', async () => {
    let failPeer!: () => void;
    const cleanup = jasmine.createSpy('cleanup');
    const playback = {
      attachWebRtc: jasmine.createSpy().and.callFake(async (_video, _id, onFatal) => { failPeer = onFatal; return cleanup; }),
      getStreamUrl: jasmine.createSpy().and.resolveTo('/playlist.m3u8'),
      attach: jasmine.createSpy().and.resolveTo(() => {})
    };
    TestBed.configureTestingModule({ imports: [CameraVideoComponent], providers: [{ provide: CameraPlaybackService, useValue: playback }] });
    const fixture = TestBed.createComponent(CameraVideoComponent); fixture.componentRef.setInput('entityId', 'camera.front_high'); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.transport).toBe('webrtc'); expect(playback.getStreamUrl).not.toHaveBeenCalled();
    failPeer(); await fixture.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(cleanup).toHaveBeenCalled(); expect(playback.attachWebRtc).toHaveBeenCalledTimes(1);
    expect(playback.getStreamUrl).toHaveBeenCalledWith('camera.front_high', true);
    expect(fixture.componentInstance.transport).toBe('hls');
    fixture.destroy();
  });
});
