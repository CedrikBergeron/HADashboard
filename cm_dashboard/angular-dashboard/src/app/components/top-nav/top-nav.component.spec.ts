import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TopNavComponent } from './top-nav.component';

describe('Room photo picker', () => {
  function createPicker() {
    TestBed.configureTestingModule({ imports: [TopNavComponent] });
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
    return { fixture, root, component: fixture.componentInstance, dialog: root.querySelector('dialog')!, trigger: root.querySelector<HTMLButtonElement>('.room-trigger')! };
  }

  it('shows only the active room in the top bar and opens cards for the current floor', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    expect(root.querySelector('.menu-wrapper')?.textContent).toContain('Salon');
    expect(root.querySelector('.menu-wrapper')?.textContent).not.toContain('Cuisine');
    trigger.click(); fixture.detectChanges();
    expect(dialog.open).toBeTrue();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.room-card').length).toBe(2);
    expect(root.querySelector('.room-card.is-selected')?.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(root.querySelector('.room-card.is-selected'));
    const image = root.querySelector<HTMLImageElement>('.room-card-photo')!;
    expect(image.getAttribute('src')).toBe(component.roomBackgrounds[0].src);
    expect(image.style.objectPosition).toBe('30% 70%');
    expect(root.querySelectorAll('.room-card-fallback').length).toBe(1);
    component.closeRoomMenu(); fixture.destroy();
  });

  it('selects a room and closes the menu while preserving the existing navigation event', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    const clicked = spyOn(component.itemClick, 'emit');
    trigger.focus(); trigger.click(); fixture.detectChanges();
    root.querySelectorAll<HTMLButtonElement>('.room-card')[1].click(); fixture.detectChanges();
    expect(clicked).toHaveBeenCalledWith(component.items[1]);
    expect(dialog.open).toBeFalse();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    fixture.destroy();
  });

  it('closes through Escape, the close button and the backdrop', () => {
    const { fixture, root, component, dialog, trigger } = createPicker();
    trigger.click(); fixture.detectChanges();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true })); fixture.detectChanges();
    expect(dialog.open).toBeFalse();
    trigger.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.room-picker-close')!.click();
    expect(component.roomMenuOpen).toBeFalse();
    trigger.click(); fixture.detectChanges();
    dialog.click(); fixture.detectChanges();
    expect(dialog.open).toBeFalse();
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
});
