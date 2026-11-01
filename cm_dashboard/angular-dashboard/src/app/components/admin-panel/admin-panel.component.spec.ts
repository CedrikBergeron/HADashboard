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
