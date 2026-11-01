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
