import { CameraWebRtcEvent, HassService } from './hass.service';

type PeerFactory = (configuration: RTCConfiguration) => RTCPeerConnection;

export class CameraWebRtcPlayer {
  constructor(private readonly hass: HassService, private readonly createPeer: PeerFactory = (configuration) => new RTCPeerConnection(configuration)) {}

  attach(video: HTMLVideoElement, entityId: string, onFatal: () => void, signal: AbortSignal): Promise<() => void> {
    if (signal.aborted || typeof RTCPeerConnection === 'undefined') return Promise.reject(new Error('WebRTC unavailable'));
    return new Promise((resolve, reject) => {
      let disposed = false;
      let ready = false;
      let peer: RTCPeerConnection | undefined;
      let unsubscribe: (() => void) | undefined;
      let sessionId = '';
      let disconnectedTimer: ReturnType<typeof setTimeout> | undefined;
      const stream = new MediaStream();
      const localCandidates: RTCIceCandidateInit[] = [];
      const remoteCandidates: RTCIceCandidateInit[] = [];
      let events = Promise.resolve();
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        clearTimeout(timeout); clearTimeout(disconnectedTimer);
        signal.removeEventListener('abort', abort);
        video.removeEventListener('loadeddata', loaded);
        unsubscribe?.();
        if (peer) { peer.ontrack = null; peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.close(); }
        stream.getTracks().forEach((track) => track.stop());
        if (video.srcObject === stream) { video.pause(); video.srcObject = null; video.load(); }
      };
      const fail = (error: unknown) => {
        if (disposed) return;
        cleanup();
        if (ready) onFatal(); else reject(error);
      };
      const abort = () => { cleanup(); if (!ready) reject(new DOMException('Camera cancelled', 'AbortError')); };
      const loaded = () => {
        if (disposed || ready || !stream.getVideoTracks().length) return;
        ready = true; clearTimeout(timeout); resolve(cleanup);
      };
      const timeout = setTimeout(() => fail(new Error('WebRTC startup timed out')), 6000);
      signal.addEventListener('abort', abort, { once: true });
      video.addEventListener('loadeddata', loaded);
      const sendCandidate = (candidate: RTCIceCandidateInit) => {
        if (!disposed) void this.hass.sendCameraIceCandidate(entityId, sessionId, candidate).catch(fail);
      };
      const receive = (event: CameraWebRtcEvent) => {
        events = events.then(async () => {
          if (disposed || !peer) return;
          if (event.type === 'error') { fail(new Error('WebRTC signalling failed')); return; }
          if (event.type === 'session') { sessionId = event.session_id; localCandidates.splice(0).forEach(sendCandidate); }
          if (event.type === 'answer') {
            await peer.setRemoteDescription({ type: 'answer', sdp: event.answer });
            for (const candidate of remoteCandidates.splice(0)) { if (!disposed) await peer.addIceCandidate(candidate); }
          }
          if (event.type === 'candidate') {
            if (peer.remoteDescription) await peer.addIceCandidate(event.candidate);
            else remoteCandidates.push(event.candidate);
          }
        }).catch(fail);
      };
      void (async () => {
        try {
          const capabilities = await this.hass.getCameraCapabilities(entityId);
          if (disposed) return;
          if (!capabilities.frontend_stream_types.includes('web_rtc')) throw new Error('Camera does not support WebRTC');
          const config = await this.hass.getCameraWebRtcConfig(entityId);
          if (disposed) return;
          peer = this.createPeer(config.configuration);
          peer.addTransceiver('video', { direction: 'recvonly' });
          peer.addTransceiver('audio', { direction: 'recvonly' });
          if (config.dataChannel) peer.createDataChannel(config.dataChannel);
          peer.ontrack = (event) => {
            if (disposed) return;
            if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
            video.srcObject = stream;
            void video.play().catch((error) => { if (error?.name === 'NotAllowedError') fail(error); });
          };
          peer.onicecandidate = (event) => {
            if (!event.candidate || disposed) return;
            const candidate = event.candidate.toJSON();
            if (sessionId) sendCandidate(candidate); else localCandidates.push(candidate);
          };
          peer.onconnectionstatechange = () => {
            if (disposed || !peer) return;
            clearTimeout(disconnectedTimer);
            if (peer.connectionState === 'failed') fail(new Error('WebRTC connection failed'));
            else if (peer.connectionState === 'disconnected') disconnectedTimer = setTimeout(() => fail(new Error('WebRTC connection lost')), 2500);
          };
          const offer = await peer.createOffer();
          if (disposed) return;
          await peer.setLocalDescription(offer);
          if (disposed) return;
          const stop = await this.hass.subscribeCameraWebRtc(entityId, peer.localDescription!.sdp, receive, signal);
          if (disposed) stop(); else unsubscribe = stop;
        } catch (error) { fail(error); }
      })();
    });
  }
}
