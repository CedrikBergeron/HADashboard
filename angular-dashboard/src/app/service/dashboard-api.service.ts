import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AdminRoom } from '../components/admin-panel/admin-panel.component';

type StoredRoom = { id: string; name: string; floor: 'main' | 'basement'; icon?: { name?: string; style?: string; filled?: boolean }; controls?: AdminRoom['controls']; climate?: AdminRoom['climate']; vacuum?: AdminRoom['vacuum']; background?: AdminRoom['background'] };
export type NotificationPreferences = { security: boolean; safety: boolean; criticalDevices: boolean; system: boolean; durationSeconds: number };
export type DashboardSettings = { homeName: string; screensaverEntityId: string; screensaverActiveState: string; fontScale: number; glassOpacity: number; reducedMotion: boolean; clock24h: boolean; tabletMode: boolean; inactivityMinutes: number; notifications: NotificationPreferences };
export type DashboardFloor = { id: string; name: string; icon: string };
export type SystemHealth = { status: string; uptime: number; node: string; homeReadable: boolean; sessions: number; now: string };
export type DashboardBackup = { id: string; createdAt: string; size: number };
export type HassConnectionStatus = { configured: boolean; connected: boolean; url?: string };
export type DashboardDevice = { id: string; name: string; createdAt: string; lastSeenAt: string; revokedAt?: string };
export type DeviceStatus = { authorized: boolean; setupRequired: boolean; device?: { id: string; name: string } | null };
type StoredHome = { id: string; name: string; rooms: StoredRoom[]; floors?: DashboardFloor[]; settings?: Partial<DashboardSettings> };

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly baseUrl = location.port === '4200' ? 'http://localhost:3000/api' : '/api';
  private adminToken = '';

  constructor(private readonly http: HttpClient) {}

  async unlock(pin: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<{ token: string }>(`${this.baseUrl}/admin/unlock`, { pin }));
    this.adminToken = response.token;
  }

  async getDeviceStatus(): Promise<DeviceStatus> { return await firstValueFrom(this.http.get<DeviceStatus>(`${this.baseUrl}/device/status`)); }
  async activateDevice(code: string, name: string): Promise<void> { await firstValueFrom(this.http.post(`${this.baseUrl}/device/activate`, { code, name })); }
  async getDevices(): Promise<DashboardDevice[]> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    return (await firstValueFrom(this.http.get<{ devices: DashboardDevice[] }>(`${this.baseUrl}/admin/devices`, { headers }))).devices;
  }
  async trustCurrentDevice(name: string): Promise<void> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    await firstValueFrom(this.http.post(`${this.baseUrl}/admin/devices/trust-current`, { name }, { headers }));
  }
  async createPairingCode(): Promise<string> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    return (await firstValueFrom(this.http.post<{ code: string }>(`${this.baseUrl}/admin/pairing-code`, {}, { headers }))).code;
  }
  async revokeDevice(id: string): Promise<void> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    await firstValueFrom(this.http.post(`${this.baseUrl}/admin/devices/${id}/revoke`, {}, { headers }));
  }

  async getHome(): Promise<{ id: string; name: string; rooms: AdminRoom[]; floors: DashboardFloor[]; settings: DashboardSettings }> {
    const home = await firstValueFrom(this.http.get<StoredHome>(`${this.baseUrl}/homes/main`));
    return {
      id: home.id,
      name: home.name,
      floors: home.floors?.length ? home.floors : [{ id: 'main', name: 'Rez-de-chaussée', icon: 'stairs' }, { id: 'basement', name: 'Sous-sol', icon: 'stairs_2' }],
      rooms: home.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        floor: room.floor,
        icon: room.icon?.name || 'meeting_room',
        iconStyle: room.icon?.style === 'rounded' || room.icon?.style === 'sharp' ? room.icon.style : 'outlined',
        iconFilled: room.icon?.filled === true,
        controls: room.controls?.map((control) => ({ ...control })),
        climate: room.climate ? { ...room.climate } : undefined,
        vacuum: room.vacuum ? { ...room.vacuum } : undefined,
        background: room.background ? { ...room.background } : undefined
      })),
      settings: {
        homeName: String(home.settings?.homeName || home.name || 'La maison'),
        screensaverEntityId: home.settings?.screensaverEntityId || 'input_boolean.dashboard',
        screensaverActiveState: home.settings?.screensaverActiveState || 'on',
        fontScale: Number(home.settings?.fontScale ?? 1), glassOpacity: Number(home.settings?.glassOpacity ?? 1),
        reducedMotion: home.settings?.reducedMotion === true, clock24h: home.settings?.clock24h !== false,
        tabletMode: home.settings?.tabletMode === true, inactivityMinutes: Number(home.settings?.inactivityMinutes ?? 5),
        notifications: {
          security: home.settings?.notifications?.security !== false,
          safety: home.settings?.notifications?.safety !== false,
          criticalDevices: home.settings?.notifications?.criticalDevices !== false,
          system: home.settings?.notifications?.system !== false,
          durationSeconds: Number(home.settings?.notifications?.durationSeconds ?? 5)
        }
      }
    };
  }

  async saveHome(rooms: AdminRoom[], floors: DashboardFloor[], settings: DashboardSettings): Promise<void> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    await firstValueFrom(this.http.put(`${this.baseUrl}/homes/main`, {
      id: 'main',
      name: 'Maison principale',
      floors,
      settings,
      rooms: rooms.map((room) => ({
        id: room.id, name: room.name, floor: room.floor,
        icon: { name: room.icon, style: room.iconStyle, filled: room.iconFilled },
        controls: room.controls,
        climate: room.climate,
        vacuum: room.vacuum,
        background: room.background
      }))
    }, { headers }));
  }

  async changeAdminPin(pin: string): Promise<void> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    await firstValueFrom(this.http.put(`${this.baseUrl}/admin/pin`, { pin }, { headers }));
  }

  async getIcons(): Promise<string[]> {
    const response = await firstValueFrom(this.http.get<{ icons: string[] }>(`${this.baseUrl}/icons`));
    return response.icons;
  }

  assetUrl(url: string): string {
    return url.startsWith('/uploads/') && location.port === '4200' ? `http://localhost:3000${url}` : url;
  }

  async uploadRoomBackground(roomId: string, dataUrl: string): Promise<string> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    const response = await firstValueFrom(this.http.post<{ url: string }>(`${this.baseUrl}/homes/main/rooms/${roomId}/background`, { dataUrl }, { headers }));
    return response.url;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    return await firstValueFrom(this.http.get<SystemHealth>(`${this.baseUrl}/system/health`));
  }

  async getBackups(): Promise<DashboardBackup[]> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    const response = await firstValueFrom(this.http.get<{ backups: DashboardBackup[] }>(`${this.baseUrl}/backups`, { headers }));
    return response.backups;
  }

  async restoreBackup(id: string): Promise<void> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    await firstValueFrom(this.http.post(`${this.baseUrl}/backups/${encodeURIComponent(id)}/restore`, {}, { headers }));
  }

  async getHassStatus(): Promise<HassConnectionStatus> { return await firstValueFrom(this.http.get<HassConnectionStatus>(`${this.baseUrl}/home-assistant/status`)); }
  async saveHassConfig(url: string, token: string): Promise<HassConnectionStatus> {
    const headers = new HttpHeaders({ 'x-admin-session': this.adminToken });
    return await firstValueFrom(this.http.put<HassConnectionStatus>(`${this.baseUrl}/home-assistant/config`, { url, token }, { headers }));
  }
}
