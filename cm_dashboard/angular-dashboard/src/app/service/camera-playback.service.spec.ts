import { CameraPlaybackService } from './camera-playback.service';
import { HassService } from './hass.service';
import { DashboardApiService } from './dashboard-api.service';

describe('Camera video playback', () => {
  it('requests Home Assistant video for the exact selected camera and proxies its playlist', async () => {
    const hass = { getCameraHlsStream: jasmine.createSpy().and.resolveTo({ url: '/api/hls/session/master_playlist.m3u8' }) };
    const api = new DashboardApiService({} as never);
    const service = new CameraPlaybackService(hass as unknown as HassService, api);
    const url = await service.getStreamUrl('camera.front_medium');
    expect(hass.getCameraHlsStream).toHaveBeenCalledWith('camera.front_medium');
    expect(url).toContain('/api/home-assistant/hls/session/master_playlist.m3u8');
    expect(() => api.cameraHlsProxyUrl('https://outside.example/private')).toThrow();
    expect(() => api.cameraHlsProxyUrl('/api/hls/../private')).toThrow();
  });

  it('uses native HLS when available and explicitly releases its source', async () => {
    const service = new CameraPlaybackService({} as HassService, {} as DashboardApiService);
    const video = document.createElement('video');
    spyOn(video, 'canPlayType').and.returnValue('probably');
    spyOn(video, 'play').and.resolveTo();
    const pause = spyOn(video, 'pause');
    const load = spyOn(video, 'load');
    const dispose = await service.attach(video, '/api/home-assistant/hls/session/master.m3u8', () => {}, new AbortController().signal, false);
    expect(video.getAttribute('src')).toContain('/api/home-assistant/hls/session/master.m3u8');
    dispose();
    expect(pause).toHaveBeenCalled(); expect(load).toHaveBeenCalled();
    expect(video.hasAttribute('src')).toBeFalse();
  });

  it('does not attach a cancelled player', async () => {
    const service = new CameraPlaybackService({} as HassService, {} as DashboardApiService);
    const video = document.createElement('video');
    const controller = new AbortController(); controller.abort();
    await expectAsync(service.attach(video, '/unused', () => {}, controller.signal, false)).toBeRejected();
    expect(video.hasAttribute('src')).toBeFalse();
  });
});
