import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CameraPlaybackService } from '../../service/camera-playback.service';
import { TopNavComponent } from './top-nav.component';

describe('Room photo picker', () => {
  function createPicker() {
    const playback = {
      attachWebRtc: jasmine.createSpy('attachWebRtc').and.rejectWith(new Error('Test HLS fallback')),
      getStreamUrl: jasmine.createSpy('getStreamUrl').and.resolveTo('/test/master.m3u8'),
      cleanup: jasmine.createSpy('cleanup'),
      attach: jasmine.createSpy('attach')
    };
    playback.attach.and.callFake(async () => playback.cleanup);
    TestBed.configureTestingModule({ imports: [TopNavComponent], providers: [{ provide: CameraPlaybackService, useValue: playback }] });
    const fixture = TestBed.createComponent(TopNavComponent);
    fixture.componentRef.setInput('floors', [{ id: 'ground', name: 'Rez-de-chaussée', icon: 'home' }, { id: 'upper', name: 'Étage', icon: 'stairs' }]);
    fixture.componentRef.setInput('items', [
      { value: 'living', label: 'Salon', floor: 'ground', active: true, icon: 'weekend' },
      { value: 'kitchen', label: 'Cuisine', floor: 'ground', icon: 'kitchen' },
      { value: 'bedroom', label: 'Chambre', floor: 'upper', icon: 'bed' }
    ]);
    fixture.componentRef.setInput('roomBackgrounds', [{ roomValue: 'living', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', positionX: 30, positionY: 70 }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, playback, component: fixture.componentInstance, dialog: root.querySelector<HTMLElement>('[popover]')!, trigger: root.querySelector<HTMLButtonElement>('.room-trigger')! };
  }

  it('shows only the active room in the top bar and opens cards for the current floor', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    expect(root.querySelector('.menu-wrapper')?.textContent).toContain('Salon');
    expect(root.querySelector('.menu-wrapper')?.textContent).not.toContain('Cuisine');
    trigger.click(); fixture.detectChanges();
    expect(dialog.matches(':popover-open')).toBeTrue();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.room-card').length).toBe(2);
    expect(root.querySelector('.room-card.is-selected')?.getAttribute('aria-current')).toBe('page');
    component.onRoomMenuAfterToggle();
    expect(document.activeElement).toBe(root.querySelector('.room-card.is-selected'));
    const image = root.querySelector<HTMLImageElement>('.room-card-photo')!;
    expect(image.getAttribute('src')).toBe(component.roomBackgrounds[0].src);
    expect(image.style.objectPosition).toBe('30% 70%');
    expect(root.querySelectorAll('.room-card-fallback').length).toBe(1);
    component.closeRoomMenu(); fixture.destroy();
  });

  it('opens below the top bar, leaves its controls available, and toggles closed from the room button', () => {
    const { fixture, root, dialog, trigger } = createPicker();
    trigger.click(); fixture.detectChanges();
    const bar = root.querySelector('.topbar')!;
    expect(dialog.getBoundingClientRect().top).toBeGreaterThanOrEqual(bar.getBoundingClientRect().bottom);
    expect(bar.closest('[inert]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('.floor-badge')!.disabled).toBeFalse();
    expect(trigger.getAttribute('popovertarget')).toBe(dialog.id);
    expect(trigger.getAttribute('popovertargetaction')).toBe('toggle');
    trigger.click(); fixture.detectChanges();
    expect(dialog.matches(':popover-open')).toBeFalse();
    fixture.destroy();
  });

  it('selects a room and closes the menu while preserving the existing navigation event', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    const clicked = spyOn(component.itemClick, 'emit');
    trigger.focus(); trigger.click(); fixture.detectChanges();
    component.onRoomMenuAfterToggle();
    root.querySelectorAll<HTMLButtonElement>('.room-card')[1].click(); fixture.detectChanges();
    expect(clicked).toHaveBeenCalledWith(component.items[1]);
    expect(dialog.matches(':popover-open')).toBeFalse();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fixture.destroy();
  });

  it('closes through Escape, the close button and the backdrop', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    trigger.click(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(dialog.matches(':popover-open')).toBeFalse();
    trigger.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.room-picker-close')!.click();
    expect(component.roomMenuOpen).toBeFalse();
    trigger.click(); fixture.detectChanges();
    document.body.click(); fixture.detectChanges();
    expect(dialog.matches(':popover-open')).toBeFalse();
    fixture.destroy();
  });

  it('uses the fallback for failed photos and handles many rooms and long names', () => {
    const { fixture, root, component, trigger } = createPicker();
    fixture.componentRef.setInput('items', Array.from({ length: 40 }, (_, index) => ({ value: index ? `room-${index}` : 'living', label: `Pièce avec un très long nom ${index}`, floor: 'ground', active: index === 0 })));
    fixture.detectChanges(); trigger.click(); fixture.detectChanges();
    expect(root.querySelectorAll('.room-card').length).toBe(40);
    root.querySelector('img')!.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(root.querySelectorAll('img').length).toBe(0);
    expect(root.querySelectorAll('.room-card-fallback').length).toBe(40);
    component.closeRoomMenu(); fixture.destroy();
  });

  it('keeps the floor switch working and displays only rooms on the new floor', fakeAsync(() => {
    const { fixture, root, component, trigger } = createPicker();
    component.toggleFloor(); tick(170); fixture.detectChanges();
    expect(component.currentFloor).toBe('upper');
    tick(360); fixture.detectChanges();
    trigger.click(); fixture.detectChanges();
    expect(root.querySelectorAll('.room-card').length).toBe(1);
    expect(root.querySelector('.room-card-name')?.textContent).toContain('Chambre');
    component.closeRoomMenu(); fixture.destroy();
  }));
  it('opens all camera feeds beside the vacuum and releases them when toggled closed', () => {
    const { fixture, root, component, trigger } = createPicker();
    fixture.componentRef.setInput('cameras', [
      { entityId: 'camera.front', name: 'Entrée', streamUrl: '/test-camera/front', available: true },
      { entityId: 'camera.garden', name: 'Jardin', streamUrl: '/test-camera/garden', available: true },
      { entityId: 'camera.offline', name: 'Garage', streamUrl: '/test-camera/garage', available: false }
    ]);
    fixture.detectChanges();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    trigger.click(); fixture.detectChanges();
    const cameraButton = root.querySelector<HTMLButtonElement>('.camera-chip')!;
    cameraButton.click(); fixture.detectChanges();
    expect(component.cameraMenuOpen).toBeTrue();
    expect(component.roomMenuOpen).toBeFalse();
    expect(root.querySelectorAll('.camera-tile').length).toBe(3);
    expect(root.querySelectorAll('.camera-visual video').length).toBe(2);
    expect(root.querySelector('.camera-stream-error')?.textContent).toContain('Caméra hors ligne');
    cameraButton.click(); fixture.detectChanges();
    expect(component.cameraMenuOpen).toBeFalse();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    fixture.destroy();
  });

  it('shows a failed video independently and retries only that camera', async () => {
    const { fixture, root, component, playback } = createPicker();
    fixture.componentRef.setInput('cameras', [
      { entityId: 'camera.front', name: 'Entrée', streamUrl: '/unused', available: true },
      { entityId: 'camera.garden', name: 'Jardin', streamUrl: '/unused', available: true }
    ]);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    root.querySelector('.camera-visual video')!.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(root.querySelectorAll('.camera-video-error').length).toBe(1);
    expect(root.querySelector('.camera-video-error')?.textContent).toContain('Flux vidéo indisponible');
    const requests = playback.getStreamUrl.calls.count();
    root.querySelector<HTMLButtonElement>('.camera-video-error button')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(playback.getStreamUrl.calls.count()).toBe(requests + 1);
    expect(playback.getStreamUrl.calls.mostRecent().args[0]).toBe('camera.front');
    expect(root.querySelectorAll('.camera-video-error').length).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    fixture.destroy();
  });

  it('displays an empty state when no cameras are detected', () => {
    const { fixture, root } = createPicker();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    expect(root.querySelector('.camera-menu-empty')?.textContent).toContain('Aucune caméra configurée.');
    root.querySelector<HTMLButtonElement>('#camera-picker .room-picker-close')!.click(); fixture.detectChanges();
    expect(root.querySelector('#camera-picker')!.matches(':popover-open')).toBeFalse();
    fixture.destroy();
  });

  it('paginates a large camera grid without scrolling or clipping names', () => {
    const { fixture, root, component } = createPicker();
    fixture.componentRef.setInput('cameras', Array.from({ length: 12 }, (_, index) => ({ entityId: `camera.offline_${index}`, name: `Caméra ${index}`, streamUrl: '/unused', available: false })));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    const grid = root.querySelector<HTMLElement>('.camera-grid')!;
    const tile = root.querySelector('.camera-tile')!.getBoundingClientRect();
    const caption = root.querySelector('.camera-tile-caption')!.getBoundingClientRect();
    expect(caption.bottom).toBeLessThanOrEqual(tile.bottom);
    expect(tile.width / tile.height).toBeCloseTo(16 / 9, 1);
    expect(grid.scrollHeight).toBeLessThanOrEqual(grid.clientHeight + 1);
    expect(root.querySelectorAll('.camera-tile').length).toBe(component.cameraPageSize);
    component.changeCameraPage(1); fixture.detectChanges();
    expect(root.querySelectorAll('.camera-tile').length).toBe(Math.min(component.cameraPageSize, 12 - component.cameraPageSize));
    component.closeCameraMenu(); fixture.destroy();
  });

  it('opens a distinct fullscreen stream and returns to the same camera page', async () => {
    const { fixture, root, component } = createPicker();
    fixture.componentRef.setInput('cameras', Array.from({ length: 12 }, (_, index) => ({ entityId: `camera.test_${index}`, name: `Caméra ${index}`, streamUrl: `/test/preview_${index}`, fullscreenEntityId: `camera.high_${index}`, available: false, fullscreenAvailable: true })));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    component.changeCameraPage(1); fixture.detectChanges();
    const id = component.pagedCameras[0].entityId;
    root.querySelector<HTMLButtonElement>('.camera-expand')!.click(); fixture.detectChanges();
    const fullscreen = root.querySelector<HTMLDialogElement>('.camera-fullscreen')!;
    expect(fullscreen.open).toBeTrue();
    await fixture.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(fixture.debugElement.injector.get(CameraPlaybackService).getStreamUrl).toHaveBeenCalledWith(`camera.high_${component.cameraPageSize}`);
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    expect(component.cameraMenuOpen).toBeFalse();
    const closed = new Promise<void>((resolve) => fullscreen.addEventListener('close', () => resolve(), { once: true }));
    root.querySelector<HTMLButtonElement>('.camera-fullscreen-close')!.click();
    await closed; fixture.detectChanges();
    expect(component.fullscreenCamera).toBeNull();
    expect(root.querySelector('.camera-fullscreen-stream')).toBeNull();
    expect(component.cameraMenuOpen).toBeTrue();
    expect(component.cameraPage).toBe(1);
    expect((document.activeElement as HTMLElement).dataset['cameraId']).toBe(id);
    component.closeCameraMenu(); fixture.destroy();
  });

  it('falls back to the primary stream and Escape returns from fullscreen to the grid', async () => {
    const { fixture, root, component } = createPicker();
    fixture.componentRef.setInput('cameras', [{ entityId: 'camera.legacy', name: 'Ancienne caméra', streamUrl: '/test/legacy', available: true }]);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-expand')!.click(); fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(fixture.debugElement.injector.get(CameraPlaybackService).getStreamUrl).toHaveBeenCalledWith('camera.legacy');
    const fullscreen = root.querySelector<HTMLDialogElement>('.camera-fullscreen')!;
    const closed = new Promise<void>((resolve) => fullscreen.addEventListener('close', () => resolve(), { once: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await closed; fixture.detectChanges();
    expect(fullscreen.open).toBeFalse();
    expect(component.cameraMenuOpen).toBeTrue();
    component.closeCameraMenu(); fixture.destroy();
  });

  it('releases all camera images before requesting admin access and prevents reopening during PIN validation', () => {
    const { fixture, root, component } = createPicker();
    fixture.componentRef.setInput('cameras', [{ entityId: 'camera.front', name: 'Entrée', streamUrl: '/test-camera/front', available: true }]); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(1);
    const streamImage = root.querySelector<HTMLImageElement>('.camera-visual video')!;
    let requested = false;
    component.clockLongPress.subscribe(() => { requested = true; expect(component.cameraMenuOpen).toBeFalse(); });
    root.querySelector('.temperature')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    expect(requested).toBeTrue();
    expect(streamImage.hasAttribute('src')).toBeFalse();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    fixture.componentRef.setInput('mediaSuspended', true); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    expect(component.cameraMenuOpen).toBeFalse();
    expect(root.querySelectorAll('.camera-visual video').length).toBe(0);
    fixture.destroy();
  });

  it('closes fullscreen for administration without reopening preview streams', async () => {
    const { fixture, root, component } = createPicker();
    fixture.componentRef.setInput('cameras', [{ entityId: 'camera.front', name: 'Entrée', streamUrl: '/test-camera/front', available: true }]); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-expand')!.click(); fixture.detectChanges();
    const fullscreen = root.querySelector<HTMLDialogElement>('.camera-fullscreen')!;
    const closed = new Promise<void>((resolve) => fullscreen.addEventListener('close', () => resolve(), { once: true }));
    fixture.componentRef.setInput('mediaSuspended', true); fixture.detectChanges();
    await closed; fixture.detectChanges();
    expect(component.cameraMenuOpen).toBeFalse();
    expect(component.fullscreenCamera).toBeNull();
    expect(root.querySelectorAll('.camera-visual video, .camera-fullscreen-stream').length).toBe(0);
    fixture.destroy();
  });

  it('explicitly cancels video players removed by a page change', async () => {
    const { fixture, root, component, playback } = createPicker();
    fixture.componentRef.setInput('cameras', Array.from({ length: 12 }, (_, index) => ({ entityId: `camera.page_${index}`, name: `Caméra ${index}`, streamUrl: `/test-camera/${index}`, available: true }))); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.camera-chip')!.click(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    const previousImages = Array.from(root.querySelectorAll<HTMLImageElement>('.camera-visual video'));
    component.changeCameraPage(1); fixture.detectChanges();
    expect(previousImages.every((image) => !image.hasAttribute('src'))).toBeTrue();
    expect(playback.cleanup).toHaveBeenCalled();
    expect(root.querySelectorAll('.camera-visual video').length).toBeGreaterThan(0);
    component.closeCameraMenu(); fixture.destroy();
  });

});
