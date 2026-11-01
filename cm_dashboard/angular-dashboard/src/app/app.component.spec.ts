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
