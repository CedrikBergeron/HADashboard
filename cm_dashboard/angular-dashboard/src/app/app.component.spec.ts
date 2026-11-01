import { HomeDashboardComponent } from './app.component';
import { DashboardApiService } from './service/dashboard-api.service';
import { HassDeviceRegistryEntry, HassEntityRegistryEntry, HassEntityState, HassService } from './service/hass.service';

describe('Home Assistant entity choices', () => {
  it('uses direct area overrides, inherits device areas and includes state-only entities', () => {
    const component = new HomeDashboardComponent({} as HassService, { deviceStorageSuffix: '' } as DashboardApiService);
    const state = component as unknown as {
      latestDevices: HassDeviceRegistryEntry[];
      latestEntityRegistry: HassEntityRegistryEntry[];
      latestEntities: Record<string, HassEntityState>;
    };
    state.latestDevices = [{ id: 'device', area_id: 'kitchen' }];
    state.latestEntityRegistry = [
      { entity_id: 'light.direct', device_id: 'device', area_id: 'office' },
      { entity_id: 'light.inherited', device_id: 'device', area_id: null },
      { entity_id: 'light.unassigned' },
      { entity_id: 'light.disabled', disabled_by: 'user' }
    ];
    state.latestEntities = { 'sensor.state_only': { entity_id: 'sensor.state_only', state: '42', attributes: {} } };
    const choices = component.adminEntityOptions;
    expect(choices.find((entry) => entry.entityId === 'light.direct')?.areaId).toBe('office');
    expect(choices.find((entry) => entry.entityId === 'light.inherited')?.areaId).toBe('kitchen');
    expect(choices.find((entry) => entry.entityId === 'light.unassigned')?.areaId).toBeUndefined();
    expect(choices.find((entry) => entry.entityId === 'sensor.state_only')?.state).toBe('42');
    expect(choices.some((entry) => entry.entityId === 'light.disabled')).toBe(false);
  });
});


describe('Camera menu discovery', () => {
  it('merges configured and discovered cameras once and flags unavailable streams', () => {
    const component = new HomeDashboardComponent({} as HassService, {
      deviceStorageSuffix: '', cameraStreamUrl: (id: string) => `/camera/${id}/stream`
    } as DashboardApiService);
    component.dashboardSettings.security.cameras = [{ entityId: 'camera.front', name: 'Entrée principale', zone: 'entrance', motionEntityId: '', motionPopupEnabled: false }];
    const state = component as unknown as { latestEntityRegistry: HassEntityRegistryEntry[]; latestEntities: Record<string, HassEntityState> };
    state.latestEntityRegistry = [
      { entity_id: 'camera.front', name: 'Front camera' }, { entity_id: 'camera.garden', name: 'Jardin' },
      { entity_id: 'camera.hidden', hidden_by: 'user' }, { entity_id: 'light.front' }
    ];
    state.latestEntities = {
      'camera.garden': { entity_id: 'camera.garden', state: 'unavailable', attributes: {} },
      'camera.state_only': { entity_id: 'camera.state_only', state: 'idle', attributes: { friendly_name: 'Terrasse' } }
    };
    expect(component.cameraMenuItems.length).toBe(3);
    expect(component.cameraMenuItems.find((camera) => camera.entityId === 'camera.front')?.name).toBe('Entrée principale');
    expect(component.cameraMenuItems.find((camera) => camera.entityId === 'camera.garden')?.available).toBeFalse();
    expect(component.cameraMenuItems.find((camera) => camera.entityId === 'camera.state_only')?.streamUrl).toBe('/camera/camera.state_only/stream');
  });
});


describe('Camera stream choices', () => {
  it('uses independent preview and fullscreen sources without creating duplicate camera tiles', () => {
    const component = new HomeDashboardComponent({} as HassService, { deviceStorageSuffix: '', cameraStreamUrl: (id: string) => `/stream/${id}` } as DashboardApiService);
    component.dashboardSettings.security.cameras = [{ entityId: 'camera.front', name: 'Entrée', zone: 'entrance', motionEntityId: '', motionPopupEnabled: false, previewEntityId: 'camera.front_low', fullscreenEntityId: 'camera.front_high' }];
    const state = component as unknown as { latestEntityRegistry: HassEntityRegistryEntry[]; latestEntities: Record<string, HassEntityState> };
    state.latestEntityRegistry = [{ entity_id: 'camera.front' }, { entity_id: 'camera.front_low' }, { entity_id: 'camera.front_high' }, { entity_id: 'camera.other' }];
    state.latestEntities = { 'camera.front_low': { entity_id: 'camera.front_low', state: 'unavailable', attributes: {} }, 'camera.front_high': { entity_id: 'camera.front_high', state: 'idle', attributes: {} } };
    expect(component.cameraMenuItems.length).toBe(2);
    const camera = component.cameraMenuItems.find((entry) => entry.entityId === 'camera.front')!;
    expect(camera.streamUrl).toBe('/stream/camera.front_low');
    expect(camera.fullscreenStreamUrl).toBe('/stream/camera.front_high');
    expect(camera.available).toBeFalse();
    expect(camera.fullscreenAvailable).toBeTrue();
  });
});
