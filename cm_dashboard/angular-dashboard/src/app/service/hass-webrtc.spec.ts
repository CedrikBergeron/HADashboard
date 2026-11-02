import { HassService } from './hass.service';

function setup() {
  const service = Object.create(HassService.prototype) as HassService;
  const send = jasmine.createSpy('send');
  Object.assign(service, { ws: { readyState: WebSocket.OPEN, send }, nextId: 1, pendingRequests: new Map(), cameraSubscriptions: new Map() });
  const handle = (message: unknown) => (service as unknown as { handleMessage(message: unknown): void }).handleMessage(message);
  const last = () => JSON.parse(send.calls.mostRecent().args[0]);
  return { service, send, handle, last };
}

describe('Home Assistant camera signalling', () => {
  it('keeps subscription events after acknowledgement and unsubscribes on abort', async () => {
    const { service, handle, last } = setup(); const controller = new AbortController(); const event = jasmine.createSpy('event');
    const pending = service.subscribeCameraWebRtc('camera.front_high', 'offer', event, controller.signal);
    const offer = last(); expect(offer.type).toBe('camera/webrtc/offer'); expect(offer.entity_id).toBe('camera.front_high');
    handle({ id: offer.id, type: 'result', success: true });
    const dispose = await pending;
    handle({ id: offer.id, type: 'event', event: { type: 'answer', answer: 'answer' } });
    expect(event).toHaveBeenCalledWith({ type: 'answer', answer: 'answer' });
    controller.abort(); expect(last().type).toBe('unsubscribe_events'); expect(last().subscription).toBe(offer.id);
    const unsubscribe = last(); handle({ id: unsubscribe.id, type: 'result', success: true });
    dispose(); event.calls.reset(); handle({ id: offer.id, type: 'event', event: { type: 'answer', answer: 'late' } });
    expect(event).not.toHaveBeenCalled();
  });

  it('releases an offer cancelled before acknowledgement', async () => {
    const { service, handle, last } = setup(); const controller = new AbortController();
    const pending = service.subscribeCameraWebRtc('camera.front', 'offer', () => {}, controller.signal);
    controller.abort(); await expectAsync(pending).toBeRejected();
    const unsubscribe = last(); expect(unsubscribe.type).toBe('unsubscribe_events');
    handle({ id: unsubscribe.id, type: 'result', success: true });
  });
});
