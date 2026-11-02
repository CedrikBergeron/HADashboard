import { fakeAsync, tick } from '@angular/core/testing';
import { CameraWebRtcPlayer } from './camera-webrtc';
import { CameraWebRtcEvent, HassService } from './hass.service';

async function flush(): Promise<void> { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function setup() {
  let listener!: (event: CameraWebRtcEvent) => void;
  const unsubscribe = jasmine.createSpy('unsubscribe');
  const hass = {
    getCameraCapabilities: jasmine.createSpy().and.resolveTo({ frontend_stream_types: ['web_rtc', 'hls'] }),
    getCameraWebRtcConfig: jasmine.createSpy().and.resolveTo({ configuration: { iceServers: [] } }),
    sendCameraIceCandidate: jasmine.createSpy().and.resolveTo(),
    subscribeCameraWebRtc: jasmine.createSpy().and.callFake(async (_id, _offer, next) => { listener = next; next({ type: 'session', session_id: 'session' }); return unsubscribe; })
  };
  const peer = {
    localDescription: null as RTCSessionDescriptionInit | null, remoteDescription: null as RTCSessionDescriptionInit | null,
    connectionState: 'new', ontrack: null as any, onicecandidate: null as any, onconnectionstatechange: null as any,
    addTransceiver: jasmine.createSpy(), createDataChannel: jasmine.createSpy(),
    createOffer: jasmine.createSpy().and.resolveTo({ type: 'offer', sdp: 'offer-sdp' }),
    setLocalDescription: jasmine.createSpy().and.callFake(async (offer) => { peer.localDescription = offer; peer.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'local-ice', sdpMid: '0' }) } }); }),
    setRemoteDescription: jasmine.createSpy().and.callFake(async (answer) => { peer.remoteDescription = answer; }),
    addIceCandidate: jasmine.createSpy().and.resolveTo(), close: jasmine.createSpy('close')
  };
  const video = document.createElement('video'); spyOn(video, 'play').and.resolveTo(); spyOn(video, 'load'); spyOn(video, 'pause');
  const player = new CameraWebRtcPlayer(hass as unknown as HassService, () => peer as unknown as RTCPeerConnection);
  return { hass, peer, video, player, unsubscribe, receive: (event: CameraWebRtcEvent) => listener(event) };
}

describe('WebRTC camera playback', () => {
  it('negotiates the selected entity, queues ICE and releases peer, tracks and subscription', async () => {
    const { hass, peer, video, player, unsubscribe, receive } = setup();
    const pending = player.attach(video, 'camera.front_medium', () => {}, new AbortController().signal);
    await flush();
    expect(hass.subscribeCameraWebRtc).toHaveBeenCalledWith('camera.front_medium', 'offer-sdp', jasmine.any(Function), jasmine.any(AbortSignal));
    expect(hass.sendCameraIceCandidate).toHaveBeenCalledWith('camera.front_medium', 'session', { candidate: 'local-ice', sdpMid: '0' });
    receive({ type: 'candidate', candidate: { candidate: 'remote-ice', sdpMid: '0' } });
    receive({ type: 'answer', answer: 'answer-sdp' }); await flush();
    expect(peer.addIceCandidate).toHaveBeenCalledWith({ candidate: 'remote-ice', sdpMid: '0' });
    const canvas = document.createElement('canvas'); const track = canvas.captureStream(1).getVideoTracks()[0];
    peer.ontrack({ track }); video.dispatchEvent(new Event('loadeddata'));
    const dispose = await pending;
    expect(video.srcObject instanceof MediaStream).toBeTrue();
    dispose(); dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1); expect(peer.close).toHaveBeenCalledTimes(1);
    expect(track.readyState).toBe('ended'); expect(video.srcObject).toBeNull();
  });

  it('rejects unsupported cameras promptly so HLS can take over', async () => {
    const { hass, player, peer, video } = setup();
    hass.getCameraCapabilities.and.resolveTo({ frontend_stream_types: ['hls'] });
    await expectAsync(player.attach(video, 'camera.legacy', () => {}, new AbortController().signal)).toBeRejected();
    expect(peer.createOffer).not.toHaveBeenCalled();
  });

  it('aborts signalling and closes the peer when the viewer closes before frames arrive', async () => {
    const { player, peer, video, unsubscribe } = setup(); const controller = new AbortController();
    const pending = player.attach(video, 'camera.front', () => {}, controller.signal);
    await flush(); controller.abort();
    await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    expect(peer.close).toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalled();
  });

  it('bounds negotiation time rather than leaving the viewer loading indefinitely', fakeAsync(() => {
    const { hass, player, video } = setup(); hass.getCameraCapabilities.and.returnValue(new Promise(() => {}));
    let failed = false; void player.attach(video, 'camera.front', () => {}, new AbortController().signal).catch(() => failed = true);
    tick(6000); expect(failed).toBeTrue();
  }));
});
