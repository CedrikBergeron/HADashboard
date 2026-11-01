import { TestBed } from '@angular/core/testing';
import { AdminPanelComponent, AdminRoom } from './admin-panel.component';
import { DashboardApiService } from '../../service/dashboard-api.service';

describe('Room configuration and Home Assistant areas', () => {
  let component: AdminPanelComponent;
  beforeEach(() => {
    component = new AdminPanelComponent({} as DashboardApiService);
    component.hassAreas = [{ area_id: 'kitchen', name: 'Cuisine', floor_id: 'ground' }];
    component.hassFloors = [{ floor_id: 'ground', name: 'Rez-de-chaussée' }];
    component.draftFloors = [{ id: 'main', name: 'Étage personnalisé', icon: 'home' }];
    component.draftRooms = [{ id: 'custom', name: 'Mon nom', floor: 'main', icon: 'home', iconStyle: 'outlined', iconFilled: false }];
    component.selectedRoomId = 'custom';
    component.entities = [
      { entityId: 'light.kitchen', name: 'Cuisine', state: 'on', areaId: 'kitchen' },
      { entityId: 'light.other', name: 'Autre pièce', state: 'off', areaId: 'other' },
      { entityId: 'climate.kitchen', name: 'Climat', state: 'heat', areaId: 'kitchen' },
      { entityId: 'light.unassigned', name: 'Sans affectation', state: 'off' }
    ];
  });
  it('suggests an area and floor without replacing existing floors or room IDs', () => {
    component.chooseArea('kitchen');
    expect(component.selectedRoom?.id).toBe('custom');
    expect(component.selectedRoom?.name).toBe('Cuisine');
    expect(component.selectedRoom?.floor).toBe('ground');
    expect(component.draftFloors[0].name).toBe('Étage personnalisé');
    component.renameRoom('Cuisine familiale');
    expect(component.selectedRoomArea?.area_id).toBe('kitchen');
    component.chooseArea('kitchen');
    expect(component.draftFloors.length).toBe(2);
  });
  it('defaults to room entities and includes unassigned entities when unchecked', () => {
    component.chooseArea('kitchen');
    component.openEntityPicker('control');
    expect(component.visibleEntities.map((entry) => entry.entityId)).toEqual(['light.kitchen', 'climate.kitchen']);
    component.onlyRoomEntities = false;
    expect(component.visibleEntities.length).toBe(4);
    component.openEntityPicker('climate');
    expect(component.onlyRoomEntities).toBeTrue();
    expect(component.visibleEntities.map((entry) => entry.entityId)).toEqual(['climate.kitchen']);
  });
  it('falls back to all entities for missing areas and leaves global pickers unscoped', () => {
    component.openEntityPicker('control');
    expect(component.visibleEntities.length).toBe(4);
    component.selectedRoom!.areaId = 'deleted';
    expect(component.visibleEntities.length).toBe(4);
    component.chooseArea('kitchen');
    component.openEntityPicker('entryLight');
    expect(component.visibleEntities.length).toBe(3);
  });
  it('recognizes legacy names and retains the area when renaming', () => {
    component.selectedRoom!.name = 'Cuisine';
    expect(component.selectedRoomArea?.area_id).toBe('kitchen');
    expect(component.selectedRoom!.areaId).toBeUndefined();
    component.renameRoom('Mon nom affiché');
    expect(component.selectedRoomArea?.area_id).toBe('kitchen');
    component.chooseArea('');
    expect(component.selectedRoomArea).toBeUndefined();
    expect(component.selectedRoom!.name).toBe('Mon nom affiché');
  });
  it('persists area IDs and preserves controls belonging to other rooms', () => {
    component.chooseArea('kitchen');
    component.selectedRoom!.controls = [{ id: 'existing', entityId: 'light.other', label: 'Existant', icon: 'light' }];
    let saved: AdminRoom[] = [];
    component.save.subscribe((payload) => saved = payload.rooms);
    component.saveChanges();
    const api = new DashboardApiService({} as never);
    const document = api.configurationDocument(saved, component.draftFloors, component.draftSettings, { floorId: 'main', roomId: 'custom' });
    expect(document.rooms[0].areaId).toBe('kitchen');
    expect(document.rooms[0].controls?.[0].entityId).toBe('light.other');
  });
});


describe('Adding rooms to the sidebar', () => {
  let component: AdminPanelComponent;
  beforeEach(() => {
    component = new AdminPanelComponent({} as DashboardApiService);
    component.draftFloors = [
      { id: 'ground', name: 'Rez-de-chaussée', icon: 'home' },
      { id: 'upper', name: 'Étage', icon: 'stairs' }
    ];
    component.draftRooms = [{ id: 'bedroom', name: 'Chambre', floor: 'upper', icon: 'bed', iconStyle: 'outlined', iconFilled: false }];
    component.selectedRoomId = 'bedroom';
  });
  it('adds the room to the selected floor even when main does not exist', () => {
    component.addRoom();
    expect(component.selectedRoom?.floor).toBe('upper');
    expect(component.floorGroups[1].rooms.map((room) => room.id)).toContain(component.selectedRoomId);
  });
  it('falls back to the first available floor when the selection is missing or its floor was removed', () => {
    component.selectedRoomId = '';
    component.addRoom();
    expect(component.selectedRoom?.floor).toBe('ground');
    component.selectedRoom!.floor = 'deleted';
    component.addRoom();
    expect(component.selectedRoom?.floor).toBe('ground');
  });
  it('creates a valid floor when none remain and keeps repeated additions visible with unique IDs', () => {
    component.draftFloors = [];
    component.draftRooms = [];
    component.addRoom();
    component.addRoom();
    expect(component.draftFloors.length).toBe(1);
    expect(component.floorGroups[0].rooms.length).toBe(2);
    expect(new Set(component.draftRooms.map((room) => room.id)).size).toBe(2);
  });
  it('renders the new selected room in the sidebar after clicking Add room', () => {
    TestBed.configureTestingModule({
      imports: [AdminPanelComponent],
      providers: [{ provide: DashboardApiService, useValue: {
        getDevices: () => Promise.resolve([]), getConfigurations: () => Promise.resolve([])
      } }]
    });
    const fixture = TestBed.createComponent(AdminPanelComponent);
    fixture.componentRef.setInput('rooms', [{ label: 'Chambre', value: 'bedroom', floor: 'upper', icon: 'bed' }]);
    fixture.componentRef.setInput('floors', component.draftFloors);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.heading-actions .primary-button')!.click();
    fixture.detectChanges();
    const rows = element.querySelectorAll('.room-list-card .room-row');
    expect(rows.length).toBe(2);
    expect(element.querySelector('.room-list-card .room-row.selected')?.textContent).toContain('Nouvelle pièce');
    expect(fixture.componentInstance.selectedRoom?.floor).toBe('upper');
    fixture.destroy();
  });
});


describe('Camera stream configuration', () => {
  it('selects independent camera sources and retains both across a save and reload', async () => {
    const component = new AdminPanelComponent({} as DashboardApiService);
    component.draftSettings.security.cameras = [{ entityId: 'camera.main', name: 'Entrée', zone: 'entrance', motionEntityId: 'binary_sensor.motion', motionPopupEnabled: true }];
    component.entities = [
      { entityId: 'camera.low', name: 'Basse résolution', state: 'idle' },
      { entityId: 'camera.high', name: 'Haute résolution', state: 'idle' },
      { entityId: 'light.test', name: 'Lampe', state: 'on' }
    ];
    component.openEntityPicker('cameraPreview', 0);
    expect(component.visibleEntities.length).toBe(2);
    component.selectPresenceEntity('camera.low');
    component.openEntityPicker('cameraFullscreen', 0);
    component.selectPresenceEntity('camera.high');
    let settings = component.draftSettings;
    component.save.subscribe((payload) => settings = payload.settings);
    component.saveChanges();
    const api = new DashboardApiService({} as never);
    const document = api.configurationDocument([], [], settings, { floorId: 'main', roomId: '' });
    spyOn(api, 'readConfiguration').and.resolveTo({ name: 'Test', dashboard: document });
    const reloaded = await api.getHome();
    expect(reloaded.settings.security.cameras[0].previewEntityId).toBe('camera.low');
    expect(reloaded.settings.security.cameras[0].fullscreenEntityId).toBe('camera.high');
    expect(reloaded.settings.security.cameras[0].motionEntityId).toBe('binary_sensor.motion');
    component.openEntityPicker('cameraPreview', 0); component.selectPresenceEntity('');
    expect(component.draftSettings.security.cameras[0].previewEntityId).toBe('');
    expect(component.draftSettings.security.cameras[0].fullscreenEntityId).toBe('camera.high');
  });

  it('keeps legacy camera configurations usable without stream overrides', async () => {
    const component = new AdminPanelComponent({} as DashboardApiService);
    component.addSecurityCamera();
    component.draftSettings.security.cameras[0].entityId = 'camera.legacy';
    const api = new DashboardApiService({} as never);
    const document = api.configurationDocument([], [], component.draftSettings, { floorId: 'main', roomId: '' });
    spyOn(api, 'readConfiguration').and.resolveTo({ name: 'Legacy', dashboard: document });
    const reloaded = await api.getHome();
    expect(reloaded.settings.security.cameras[0].entityId).toBe('camera.legacy');
    expect(reloaded.settings.security.cameras[0].previewEntityId).toBe('');
    expect(reloaded.settings.security.cameras[0].fullscreenEntityId).toBe('');
  });
});


describe('Camera stream controls in the administration', () => {
  it('selects both streams through the rendered controls and saves them', () => {
    TestBed.configureTestingModule({ imports: [AdminPanelComponent], providers: [{ provide: DashboardApiService, useValue: { getDevices: () => Promise.resolve([]), getConfigurations: () => Promise.resolve([]) } }] });
    const fixture = TestBed.createComponent(AdminPanelComponent);
    const component = fixture.componentInstance;
    component.activeSection = 'video';
    component.draftSettings.security.cameras = [{ entityId: 'camera.main', name: 'Entrée', zone: 'entrance', motionEntityId: '', motionPopupEnabled: false }];
    fixture.componentRef.setInput('entities', [{ entityId: 'camera.low', name: 'Basse résolution', state: 'idle' }, { entityId: 'camera.high', name: 'Haute résolution', state: 'idle' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const streamButtons = root.querySelectorAll<HTMLButtonElement>('.camera-stream-choices .camera-entity');
    expect(streamButtons.length).toBe(2);
    expect(streamButtons[0].textContent).toContain('Flux du menu');
    streamButtons[0].click(); fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.entity-picker .entity-result')).find((button) => button.textContent?.includes('camera.low'))!.click(); fixture.detectChanges();
    streamButtons[1].click(); fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.entity-picker .entity-result')).find((button) => button.textContent?.includes('camera.high'))!.click(); fixture.detectChanges();
    const save = spyOn(component.save, 'emit');
    root.querySelector<HTMLButtonElement>('.admin-footer .primary-button')!.click();
    expect(save).toHaveBeenCalled();
    const camera = save.calls.mostRecent().args[0]!.settings.security.cameras[0];
    expect(camera.previewEntityId).toBe('camera.low');
    expect(camera.fullscreenEntityId).toBe('camera.high');
    expect(camera.entityId).toBe('camera.main');
    fixture.destroy();
  });
});
