import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { combineLatest, Subscription } from 'rxjs';
import { TopNavActionChip, TopNavComponent } from './components/top-nav/top-nav.component';
import {
  BottomControlBarComponent,
  BottomControlItem
} from './components/bottom-control-bar/bottom-control-bar.component';
import { NavItem } from './models/NavItem';
import { AdminEntityOption, AdminPanelComponent, AdminRoom, AdminSavePayload } from './components/admin-panel/admin-panel.component';
import { DashboardApiService, DashboardFloor, DashboardSettings, SecurityCamera } from './service/dashboard-api.service';
import {
  HassAreaRegistryEntry,
  HassDeviceRegistryEntry,
  HassEntityRegistryEntry,
  HassEntityState,
  HassService,
  HassServiceCatalog
} from './service/hass.service';

type Floor = string;

type DashboardControlItem = BottomControlItem & {
  entityId: string;
  domain: string;
  state: string;
  tapAction?: 'toggle' | 'turn_on' | 'turn_off';
  holdAction?: 'none' | 'toggle' | 'turn_on' | 'turn_off';
  confirm?: boolean;
};

type VacuumControl = {
  entityId: string;
  label: string;
  state: string;
  isActive: boolean;
};

type RoomClimateControl = {
  entityId: string;
  label: string;
  currentTemperature?: number;
  targetTemperature?: number;
  minTemperature: number;
  maxTemperature: number;
  temperatureStep: number;
  status: string;
};

type HomeAttentionItem = { icon: string; label: string; detail: string; tone: 'normal' | 'warning' | 'danger' };
type HomeToast = { id: number; icon: string; title: string; detail: string };

const FALLBACK_NAV_ITEMS: NavItem[] = [{ label: 'Room', value: 'room', floor: 'main', active: true, icon: 'meeting_room' }];
const DEFAULT_ROOM_VALUE = 'room';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, TopNavComponent, BottomControlBarComponent, AdminPanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class HomeDashboardComponent implements OnInit, OnDestroy {
  private adminSessionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private adminRoomsOverride: AdminRoom[] | null = null;
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;
  private roomTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly roomTransitionDurationMs = 180;
  private readonly sliderUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions = new Subscription();
  private toastSequence = 0;
  private notificationsInitialized = false;
  private previousDoorbellMarker = '';
  private doorbellTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private previousImportantStates: Record<string, string> = {};
  private climateDialPointerId: number | null = null;
  private climateCommitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private climatePopoutCloseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private vacuumReturnOverrideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private vacuumSheetCloseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private screensaverIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly climatePopoutAnimationDurationMs = 280;
  private readonly vacuumReturnOverrideDurationMs = 60_000;
  private readonly homeReturnDurationMs = 120_000;
  private readonly screensaverWakeDurationMs = 300_000;
  private readonly screensaverRoomDurationMs = 15_000;
  private readonly climateDialStartAngle = 140;
  private readonly climateDialSweep = 260;
  private readonly climateDialCenterX = 120;
  private readonly climateDialCenterY = 110;
  private readonly climateDialRadius = 86;

  now = '19:58';

  navItems: NavItem[] = FALLBACK_NAV_ITEMS;
  roomName = 'Room';
  activeRoomValue = 'room';
  temperature = -3.1;
  humidity = 86;

  activeControls: DashboardControlItem[] = [];
  controlsVisible = true;
  climatePopoutOpen = false;
  climatePopoutClosing = false;
  currentRoomClimate: RoomClimateControl | null = null;
  vacuumActionChip: TopNavActionChip | null = null;
  vacuumControl: VacuumControl | null = null;
  vacuumSheetOpen = false;
  vacuumSheetClosing = false;
  controlDetail: DashboardControlItem | null = null;
  vacuumSupportsAreaCleaning = false;
  dashboardPresenceActive = true;
  screensaverActive = false;
  lastRoomValue = 'entree';
  homeToasts: HomeToast[] = [];
  hassConnected = false;
  adminUnlockOpen = false;
  adminPanelOpen = false;
  adminPinValue = '';
  adminPinError = '';
  adminSaveError = '';
  deviceAuthorized: boolean | null = null;
  activationCode = '';
  activationName = 'Tablette murale';
  activationError = '';
  activationBusy = false;
  hassSetupRequired = false;
  hassNoticeDismissed = false;
  dashboardSettings: DashboardSettings = { language: 'en', homeName: 'My home', screensaverEntityId: '', screensaverActiveState: 'on', fontScale: 1, glassOpacity: 1, reducedMotion: false, clock24h: true, tabletMode: false, inactivityMinutes: 5, notifications: { security: true, safety: true, criticalDevices: true, system: true, durationSeconds: 5 }, security: { enabled: false, cameras: [], doorbellEntityId: '', doorbellCameraEntityId: '', doorLockEntityId: '', entryLightEntityId: '', doorbellDurationSeconds: 25 } };
  securityCenterOpen = false;
  securityZone: 'all' | SecurityCamera['zone'] = 'all';
  selectedSecurityCamera = 0;
  doorbellOpen = false;
  deviceDefaultFloorId = localStorage.getItem('ha-dashboard-default-floor') || 'main';
  dashboardFloors: DashboardFloor[] = [{ id: 'main', name: 'Main floor', icon: 'home' }];
  get roomBackgrounds(): Array<{ roomValue: string; src: string; positionX: number; positionY: number; brightness: number; saturation: number; contrast: number; overlay: number }> {
    return this.navItems.flatMap((nav) => {
      const roomValue = nav.value ?? '';
      const configured = this.adminRoomsOverride?.find((room) => room.id === roomValue)?.background;
      const src = configured?.url ? this.dashboardApi.assetUrl(configured.url) : '';
      if (!src) return [];
      return [{ roomValue, src, positionX: configured?.positionX ?? 50, positionY: configured?.positionY ?? 50, brightness: configured?.brightness ?? .72, saturation: configured?.saturation ?? .9, contrast: configured?.contrast ?? 1.02, overlay: configured?.overlay ?? .26 }];
    });
  }

  get activeBackgroundOverlay(): number {
    return this.roomBackgrounds.find((background) => background.roomValue === this.activeRoomValue)?.overlay ?? .26;
  }

  get overviewActive(): boolean { return this.activeRoomValue === '__overview__'; }
  get displayBackgroundRoomValue(): string { return this.overviewActive ? this.lastRoomValue : this.activeRoomValue; }

  get attentionItems(): HomeAttentionItem[] {
    const values = Object.values(this.latestEntities);
    const lights = values.filter((entity) => entity.entity_id.startsWith('light.') && entity.state === 'on').length;
    const unlocked = values.filter((entity) => entity.entity_id.startsWith('lock.') && ['unlocked','unlocking'].includes(entity.state)).length;
    const openings = values.filter((entity) => entity.entity_id.startsWith('binary_sensor.') && entity.state === 'on' && ['door','window','garage_door','opening'].includes(String(entity.attributes['device_class']))).length;
    const items: HomeAttentionItem[] = [];
    if (unlocked) items.push({ icon: 'lock_open', label: `${unlocked} porte${unlocked > 1 ? 's' : ''} déverrouillée${unlocked > 1 ? 's' : ''}`, detail: 'Sécurité', tone: 'danger' });
    if (openings) items.push({ icon: 'door_open', label: `${openings} ouverture${openings > 1 ? 's' : ''}`, detail: 'Porte ou fenêtre ouverte', tone: 'warning' });
    if (lights) items.push({ icon: 'lightbulb', label: `${lights} lumière${lights > 1 ? 's' : ''} allumée${lights > 1 ? 's' : ''}`, detail: 'Dans la maison', tone: 'normal' });
    return items;
  }
  get lightsOnCount(): number { return Object.values(this.latestEntities).filter((entity) => entity.entity_id.startsWith('light.') && entity.state === 'on').length; }
  get unlockedCount(): number { return Object.values(this.latestEntities).filter((entity) => entity.entity_id.startsWith('lock.') && ['unlocked','unlocking'].includes(entity.state)).length; }
  get openAccessCount(): number { return Object.values(this.latestEntities).filter((entity) => entity.entity_id.startsWith('binary_sensor.') && entity.state === 'on' && ['door','window','garage_door','opening'].includes(String(entity.attributes['device_class']))).length; }
  get homeStatusLabel(): string { return this.unlockedCount || this.openAccessCount ? 'Attention requise' : 'Maison en ordre'; }
  get homeSecure(): boolean { return this.unlockedCount === 0 && this.openAccessCount === 0; }
  private get importantDashboardEntityIds(): Set<string> {
    const ids = new Set<string>();
    for (const room of this.adminRoomsOverride || []) {
      for (const control of room.controls || []) if (control.entityId) ids.add(control.entityId);
      if (room.climate?.enabled && room.climate.entityId) ids.add(room.climate.entityId);
      if (room.vacuum?.enabled && room.vacuum.entityId) ids.add(room.vacuum.entityId);
    }
    return ids;
  }
  get visibleSecurityCameras(): SecurityCamera[] { const cameras = this.dashboardSettings.security.cameras.filter((camera) => camera.entityId); return this.securityZone === 'all' ? cameras : cameras.filter((camera) => camera.zone === this.securityZone); }
  get activeSecurityCamera(): SecurityCamera | undefined { return this.visibleSecurityCameras[Math.min(this.selectedSecurityCamera, Math.max(0, this.visibleSecurityCameras.length - 1))]; }
  cameraSnapshotUrl(entityId: string): string { return this.dashboardApi.cameraSnapshotUrl(entityId); }
  entityLabelForDashboard(entityId: string): string { return String(this.latestEntities[entityId]?.attributes?.['friendly_name'] || 'Entrée principale'); }
  setSecurityZone(zone: typeof this.securityZone): void { this.securityZone = zone; this.selectedSecurityCamera = 0; }
  toggleSecurityCenter(): void { this.securityCenterOpen = !this.securityCenterOpen; if (this.securityCenterOpen) { this.closeClimatePopout(); this.closeVacuumSheet(); } }
  closeSecurityCenter(): void { this.securityCenterOpen = false; }
  closeDoorbell(): void { this.doorbellOpen = false; if (this.doorbellTimeoutId) clearTimeout(this.doorbellTimeoutId); this.doorbellTimeoutId = null; }
  async unlockDoorFromDoorbell(): Promise<void> { const id = this.dashboardSettings.security.doorLockEntityId; if (!id || !window.confirm('Déverrouiller la porte?')) return; try { await this.hass.callService('lock','unlock',id); this.closeDoorbell(); } catch { this.showActionToast('Porte','Le déverrouillage a échoué','error'); } }
  async turnOnEntryLight(): Promise<void> { const id = this.dashboardSettings.security.entryLightEntityId; if (!id) return; try { await this.hass.callService(id.split('.')[0],'turn_on',id); } catch { this.showActionToast('Éclairage','La commande a échoué','error'); } }
  get weatherState(): HassEntityState | undefined { return Object.values(this.latestEntities).find((entity) => entity.entity_id.startsWith('weather.')); }
  get weatherTemperature(): string { const value = this.weatherState?.attributes?.['temperature']; return value === undefined ? '--' : `${Math.round(Number(value))}°`; }
  get weatherLabel(): string {
    const state = String(this.weatherState?.state || 'unknown').toLowerCase();
    return ({ sunny: 'Ensoleillé', clear: 'Dégagé', 'clear-night': 'Nuit dégagée', cloudy: 'Nuageux', partlycloudy: 'Partiellement nuageux', rainy: 'Pluvieux', pouring: 'Forte pluie', snowy: 'Neige', fog: 'Brouillard', foggy: 'Brouillard', windy: 'Venteux', lightning: 'Orages', 'lightning-rainy': 'Orages et pluie', hail: 'Grêle', exceptional: 'Conditions exceptionnelles', unknown: 'Météo indisponible' } as Record<string,string>)[state] ?? this.capitalizeWords(state.replace(/_/g, ' '));
  }
  get weatherIcon(): string { const state = this.weatherState?.state || ''; if (state.includes('rain') || state.includes('pouring')) return 'rainy'; if (state.includes('snow')) return 'weather_snowy'; if (state.includes('cloud')) return 'cloud'; if (state.includes('lightning')) return 'thunderstorm'; if (state.includes('fog')) return 'foggy'; return 'sunny'; }
  get currentDateLabel(): string { return new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }); }

  isDaytime = false;
  bgBrightness = 0.72;
  bgSaturation = 0.9;
  bgContrast = 1.02;
  overlayColor = 'rgba(60, 60, 65, 0.26)';

  private controlsByRoom: Record<string, DashboardControlItem[]> = {};
  private roomAreaIdsByValue: Record<string, string> = {};
  private latestDevices: HassDeviceRegistryEntry[] = [];
  private latestEntityRegistry: HassEntityRegistryEntry[] = [];
  private latestEntities: Record<string, HassEntityState> = {};
  private dashboardPresenceInitialized = false;
  private screensaverWakeOverrideActive = false;

  constructor(private readonly hass: HassService, private readonly dashboardApi: DashboardApiService) {}

  ngOnInit(): void {
    void this.checkDeviceAccess();
    void this.loadSavedHome();
    void this.dashboardApi.getHassStatus().then((status) => this.hassSetupRequired = !status.connected).catch(() => this.hassSetupRequired = true);
    this.setActiveRoom(this.navItems.find((nav) => nav.active)?.value ?? 'entree');
    this.updateClock();

    this.clockIntervalId = setInterval(() => {
      this.updateClock();
    }, 1000);
    this.resetInactivityTimer();

    this.subscriptions.add(
      combineLatest([
        this.hass.areas$,
        this.hass.devices$,
        this.hass.entityRegistry$,
        this.hass.entities$,
        this.hass.services$
      ]).subscribe(([areas, devices, entityRegistry, entities, services]) => {
        this.syncDashboardState(areas, devices, entityRegistry, entities, services);
      })
    );
    this.subscriptions.add(this.hass.connected$.subscribe((connected) => this.hassConnected = connected));
  }

  async checkDeviceAccess(): Promise<void> {
    try { this.deviceAuthorized = (await this.dashboardApi.getDeviceStatus()).authorized; }
    catch { this.deviceAuthorized = true; }
  }

  async activateDevice(): Promise<void> {
    this.activationBusy = true; this.activationError = '';
    try { await this.dashboardApi.activateDevice(this.activationCode, this.activationName); this.deviceAuthorized = true; location.reload(); }
    catch { this.activationError = 'Code ou NIP invalide.'; }
    finally { this.activationBusy = false; }
  }

  ngOnDestroy(): void {
    if (this.adminSessionTimeoutId) clearTimeout(this.adminSessionTimeoutId);
    if (this.doorbellTimeoutId) clearTimeout(this.doorbellTimeoutId);
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }

    if (this.roomTransitionTimeoutId) {
      clearTimeout(this.roomTransitionTimeoutId);
      this.roomTransitionTimeoutId = null;
    }

    if (this.climateCommitTimeoutId) {
      clearTimeout(this.climateCommitTimeoutId);
      this.climateCommitTimeoutId = null;
    }

    if (this.climatePopoutCloseTimeoutId) {
      clearTimeout(this.climatePopoutCloseTimeoutId);
      this.climatePopoutCloseTimeoutId = null;
    }

    if (this.vacuumReturnOverrideTimeoutId) {
      clearTimeout(this.vacuumReturnOverrideTimeoutId);
      this.vacuumReturnOverrideTimeoutId = null;
    }
    if (this.vacuumSheetCloseTimeoutId) clearTimeout(this.vacuumSheetCloseTimeoutId);

    if (this.inactivityTimeoutId) {
      clearTimeout(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }

    if (this.screensaverIntervalId) {
      clearInterval(this.screensaverIntervalId);
      this.screensaverIntervalId = null;
    }

    for (const timer of this.sliderUpdateTimers.values()) {
      clearTimeout(timer);
    }

    this.sliderUpdateTimers.clear();
    this.subscriptions.unsubscribe();
  }

  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  @HostListener('document:wheel')
  onUserActivity(): void {
    if (this.screensaverActive) {
      this.wakeFromScreensaver();
      return;
    }

    this.resetInactivityTimer();
  }

  onNavClick(item: NavItem): void {
    this.resetInactivityTimer();
    const nextRoomValue = item.value ?? this.activeRoomValue;
    if (nextRoomValue === this.activeRoomValue) {
      return;
    }

    this.transitionToRoom(nextRoomValue, item.label, true);
  }

  onClockLongPress(): void {
    this.adminUnlockOpen = true;
    this.adminPinValue = '';
    this.adminPinError = '';
  }

  onAdminPinInput(event: Event): void {
    this.adminPinValue = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    this.adminPinError = '';
  }

  async unlockAdmin(): Promise<void> {
    try {
      await this.dashboardApi.unlock(this.adminPinValue);
      this.adminUnlockOpen = false;
      this.adminPanelOpen = true;
      this.refreshAdminSession();
    } catch (error: any) {
      this.adminPinError = error?.error?.error || (error?.status === 0 ? 'Serveur indisponible' : 'Impossible de vérifier le NIP');
    }
  }

  closeAdmin(): void {
    this.adminUnlockOpen = false;
    this.adminPanelOpen = false;
    this.adminPinValue = '';
    if (this.adminSessionTimeoutId) clearTimeout(this.adminSessionTimeoutId);
  }

  get adminEntityOptions(): AdminEntityOption[] {
    return this.latestEntityRegistry
      .filter((entry) => !entry.disabled_by && !entry.hidden_by)
      .map((entry) => ({
        entityId: entry.entity_id,
        name: String(this.latestEntities[entry.entity_id]?.attributes?.['friendly_name'] || entry.name || entry.original_name || entry.entity_id),
        state: this.latestEntities[entry.entity_id]?.state || 'indisponible'
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  }

  get adminRoomsForEditor(): NavItem[] {
    return this.navItems.map((nav) => {
      const room = this.adminRoomsOverride?.find((candidate) => candidate.id === nav.value);
      const automaticClimate = nav.value ? this.buildRoomClimate(this.latestEntityRegistry, this.latestDevices, this.latestEntities, nav.value) : null;
      return {
        ...nav,
        controls: room?.controls ?? (this.controlsByRoom[nav.value ?? ''] ?? []).map((control) => ({ id: control.entityId, label: control.name, entityId: control.entityId, icon: control.icon })),
        climate: room?.climate ?? { enabled: Boolean(automaticClimate), entityId: automaticClimate?.entityId ?? '' },
        vacuum: room?.vacuum ?? { enabled: false, entityId: '', roomParameter: '' },
        background: room?.background
      };
    });
  }

  async saveAdminRooms(payload: AdminSavePayload): Promise<void> {
    const { rooms, floors, settings, deviceDefaultFloorId } = payload;
    this.adminRoomsOverride = rooms.map((room) => ({ ...room }));
    this.dashboardSettings = { ...settings };
    this.applyInterfaceSettings();
    if (!this.screensaverActive) this.resetInactivityTimer();
    this.dashboardFloors = floors.map((floor) => ({ ...floor }));
    this.deviceDefaultFloorId = deviceDefaultFloorId || floors[0]?.id || 'main';
    localStorage.setItem('ha-dashboard-default-floor', this.deviceDefaultFloorId);
    this.dashboardPresenceInitialized = false;
    if (!settings.screensaverEntityId) {
      this.dashboardPresenceActive = true;
      this.stopScreensaver();
    }
    const activeStillExists = rooms.some((room) => room.id === this.activeRoomValue);
    this.navItems = rooms.map((room, index) => ({
      label: room.name,
      value: room.id,
      floor: room.floor,
      active: activeStillExists ? room.id === this.activeRoomValue : index === 0,
      icon: room.icon,
      iconStyle: room.iconStyle,
      iconFilled: room.iconFilled,
      controls: room.controls,
      climate: room.climate,
      vacuum: room.vacuum,
      background: room.background
    }));
    if (!activeStillExists && this.navItems[0]) this.setActiveRoom(this.navItems[0].value ?? 'entree', this.navItems[0].label);
    try {
      await this.dashboardApi.saveHome(rooms, floors, settings);
      this.adminSaveError = '';
      this.refreshAdminSession();
    } catch {
      this.adminSaveError = 'La sauvegarde serveur a échoué. Déverrouillez de nouveau l’administration.';
    }
  }

  private async loadSavedHome(): Promise<void> {
    try {
      const home = await this.dashboardApi.getHome();
      this.adminRoomsOverride = home.rooms;
      this.dashboardSettings = home.settings;
      this.applyInterfaceSettings();
      // The initial timer starts before the server settings arrive.
      // Restart it so the configured inactivity delay is actually respected.
      if (!this.screensaverActive) this.resetInactivityTimer();
      this.dashboardFloors = home.floors;
      this.navItems = home.rooms.map((room, index) => ({
        label: room.name,
        value: room.id,
        floor: room.floor,
        active: room.id === this.activeRoomValue || index === 0,
        icon: room.icon,
        iconStyle: room.iconStyle,
        iconFilled: room.iconFilled,
        controls: room.controls,
        climate: room.climate,
        vacuum: room.vacuum,
        background: room.background
      }));
    } catch {
      // Keep the built-in configuration when the local server is unavailable.
    }
  }

  private refreshAdminSession(): void {
    if (this.adminSessionTimeoutId) clearTimeout(this.adminSessionTimeoutId);
    this.adminSessionTimeoutId = setTimeout(() => this.closeAdmin(), 15 * 60_000);
  }

  private transitionToRoom(roomValue: string, fallbackLabel?: string, showControlsAfter = true): void {
    this.navItems = this.navItems.map((navItem) => ({
      ...navItem,
      active: navItem.value === roomValue
    }));

    this.controlsVisible = false;

    if (this.roomTransitionTimeoutId) {
      clearTimeout(this.roomTransitionTimeoutId);
    }

    this.roomTransitionTimeoutId = setTimeout(() => {
      this.setActiveRoom(roomValue, fallbackLabel);
      this.controlsVisible = showControlsAfter && !this.screensaverActive;
      this.roomTransitionTimeoutId = null;
    }, this.roomTransitionDurationMs);
  }

  async onControlClick(item: BottomControlItem): Promise<void> {
    this.resetInactivityTimer();
    if (!this.hassConnected) { this.showOfflineToast(); return; }
    const control = item as DashboardControlItem;
    control.pending = true;
    try {
      await this.handleConfiguredControlAction(control, control.tapAction ?? 'toggle');
    } catch {
      this.showActionToast(control.name, 'La commande a échoué', 'error');
    } finally {
      control.pending = false;
    }
  }

  onControlLongPress(item: BottomControlItem): void {
    const control = item as DashboardControlItem;
    this.resetInactivityTimer();
    if (control.holdAction && control.holdAction !== 'none') {
      void this.handleConfiguredControlAction(control, control.holdAction);
      return;
    }
    this.controlDetail = control;
    this.closeClimatePopout();
    this.closeVacuumSheet();
  }

  closeControlDetail(): void { this.controlDetail = null; }

  async onControlDetailAction(action: 'turn_on' | 'turn_off' | 'toggle'): Promise<void> {
    if (!this.controlDetail || !this.hassConnected) { if (!this.hassConnected) this.showOfflineToast(); return; }
    const control = this.controlDetail;
    control.pending = true;
    try {
      await this.handleConfiguredControlAction(control, action);
    } catch {
      this.showActionToast(control.name, 'La commande a échoué', 'error');
    } finally {
      control.pending = false;
    }
  }

  onControlDetailSlider(event: Event): void {
    if (!this.controlDetail) return;
    this.onSliderChange({ item: this.controlDetail, value: Number((event.target as HTMLInputElement).value) });
  }

  get controlDetailOnLabel(): string {
    return this.controlDetail?.domain === 'lock' ? 'Déverrouiller' : this.controlDetail?.domain === 'cover' ? 'Ouvrir' : 'Allumer';
  }

  get controlDetailOffLabel(): string {
    return this.controlDetail?.domain === 'lock' ? 'Verrouiller' : this.controlDetail?.domain === 'cover' ? 'Fermer' : 'Éteindre';
  }

  get controlDetailSliderLabel(): string {
    if (this.controlDetail?.domain === 'cover') return 'Ouverture';
    if (this.controlDetail?.domain === 'fan') return 'Vitesse';
    return 'Luminosité';
  }

  onSliderChange(event: { item: BottomControlItem; value: number }): void {
    this.resetInactivityTimer();
    if (!this.hassConnected) { this.showOfflineToast(); return; }
    const item = event.item as DashboardControlItem;
    this.scheduleSliderUpdate(item, event.value);
  }

  get isClimatePopoutVisible(): boolean {
    return this.climatePopoutOpen || this.climatePopoutClosing;
  }

  toggleClimatePopout(): void {
    this.resetInactivityTimer();
    if (!this.currentRoomClimate) {
      return;
    }

    if (this.climatePopoutOpen) {
      this.closeClimatePopout();
      return;
    }

    if (this.climatePopoutCloseTimeoutId) {
      clearTimeout(this.climatePopoutCloseTimeoutId);
      this.climatePopoutCloseTimeoutId = null;
    }

    this.climatePopoutClosing = false;
    this.climatePopoutOpen = true;
    this.closeVacuumSheet();
  }

  closeClimatePopout(): void {
    if (!this.climatePopoutOpen && !this.climatePopoutClosing) {
      return;
    }

    if (this.climatePopoutCloseTimeoutId) {
      clearTimeout(this.climatePopoutCloseTimeoutId);
    }

    this.climatePopoutOpen = false;
    this.climatePopoutClosing = true;
    this.climatePopoutCloseTimeoutId = setTimeout(() => {
      this.climatePopoutClosing = false;
      this.climatePopoutCloseTimeoutId = null;
    }, this.climatePopoutAnimationDurationMs);
  }

  onClimateDialPointerDown(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement | null;
    if (!svg || !this.currentRoomClimate) {
      return;
    }

    this.climateDialPointerId = event.pointerId;
    svg.setPointerCapture(event.pointerId);
    this.updateClimateFromDialPointer(event, svg);
  }

  onClimateDialPointerMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement | null;
    if (!svg || this.climateDialPointerId !== event.pointerId || !this.currentRoomClimate) {
      return;
    }

    this.updateClimateFromDialPointer(event, svg);
  }

  onClimateDialPointerUp(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement | null;
    if (svg && this.climateDialPointerId === event.pointerId) {
      svg.releasePointerCapture(event.pointerId);
    }

    this.climateDialPointerId = null;
  }

  get climateArcProgress(): number {
    if (!this.currentRoomClimate) {
      return 0;
    }

    const range = this.currentRoomClimate.maxTemperature - this.currentRoomClimate.minTemperature;
    if (range <= 0) {
      return 0;
    }

    const target = this.currentRoomClimate.targetTemperature ?? this.currentRoomClimate.currentTemperature ?? this.currentRoomClimate.minTemperature;
    const progress = ((target - this.currentRoomClimate.minTemperature) / range) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  get climateDialPath(): string {
    const startPoint = this.getDialPoint(this.climateDialStartAngle);
    const endPoint = this.getDialPoint(this.climateDialStartAngle + this.climateDialSweep);
    return `M ${startPoint.x} ${startPoint.y} A ${this.climateDialRadius} ${this.climateDialRadius} 0 1 1 ${endPoint.x} ${endPoint.y}`;
  }

  get climateDialThumbX(): number {
    return this.getDialPoint(this.climateDialStartAngle + (this.climateDialSweep * this.climateArcProgress) / 100).x;
  }

  get climateDialThumbY(): number {
    return this.getDialPoint(this.climateDialStartAngle + (this.climateDialSweep * this.climateArcProgress) / 100).y;
  }

  get climateCurrentProgress(): number {
    if (!this.currentRoomClimate) {
      return 0;
    }

    const range = this.currentRoomClimate.maxTemperature - this.currentRoomClimate.minTemperature;
    if (range <= 0) {
      return 0;
    }

    const current =
      this.currentRoomClimate.currentTemperature ??
      this.currentRoomClimate.targetTemperature ??
      this.currentRoomClimate.minTemperature;
    const progress = ((current - this.currentRoomClimate.minTemperature) / range) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  get climateCurrentX(): number {
    return this.getDialPoint(this.climateDialStartAngle + (this.climateDialSweep * this.climateCurrentProgress) / 100).x;
  }

  get climateCurrentY(): number {
    return this.getDialPoint(this.climateDialStartAngle + (this.climateDialSweep * this.climateCurrentProgress) / 100).y;
  }

  onVacuumChipClick(): void {
    this.resetInactivityTimer();
    if (!this.vacuumControl) {
      return;
    }
    if (this.vacuumSheetOpen) { this.closeVacuumSheet(); return; }
    if (this.vacuumSheetCloseTimeoutId) clearTimeout(this.vacuumSheetCloseTimeoutId);
    this.vacuumSheetClosing = false;
    this.vacuumSheetOpen = true;
    this.closeClimatePopout();
  }

  closeVacuumSheet(): void {
    if (!this.vacuumSheetOpen && !this.vacuumSheetClosing) return;
    this.vacuumSheetOpen = false;
    this.vacuumSheetClosing = true;
    if (this.vacuumSheetCloseTimeoutId) clearTimeout(this.vacuumSheetCloseTimeoutId);
    this.vacuumSheetCloseTimeoutId = setTimeout(() => {
      this.vacuumSheetClosing = false;
      this.vacuumSheetCloseTimeoutId = null;
    }, 280);
  }

  get isVacuumSheetVisible(): boolean { return this.vacuumSheetOpen || this.vacuumSheetClosing; }

  private resetInactivityTimer(): void {
    if (this.inactivityTimeoutId) {
      clearTimeout(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }

    this.inactivityTimeoutId = setTimeout(() => {
      this.inactivityTimeoutId = null;
      this.startScreensaver();
    }, Math.max(1, this.dashboardSettings.inactivityMinutes) * 60_000);
  }

  private wakeFromScreensaver(): void {
    this.stopScreensaver();
    this.showHomeOverview();
    this.resetInactivityTimer();
  }

  private showHomeOverview(): void {
    const defaultRoom = this.navItems.find((item) => item.floor === this.deviceDefaultFloorId && item.value);
    this.lastRoomValue = defaultRoom?.value ?? (this.activeRoomValue === '__overview__' ? this.lastRoomValue : this.activeRoomValue);
    this.activeRoomValue = '__overview__';
    this.activeControls = [];
    this.currentRoomClimate = null;
    this.vacuumControl = null;
    this.vacuumActionChip = null;
    this.controlsVisible = false;
    this.navItems = this.navItems.map((item) => ({ ...item, active: false }));
    this.closeClimatePopout();
    this.closeVacuumSheet();
    this.closeControlDetail();
  }

  private startScreensaver(): void {
    if (this.screensaverActive) {
      return;
    }

    this.screensaverActive = true;
    this.controlsVisible = false;
    this.closeClimatePopout();
    this.closeVacuumSheet();

    if (this.inactivityTimeoutId) {
      clearTimeout(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }

    if (this.screensaverIntervalId) {
      clearInterval(this.screensaverIntervalId);
    }

    this.screensaverIntervalId = setInterval(() => {
      this.showNextScreensaverRoom();
    }, this.screensaverRoomDurationMs);
  }

  private stopScreensaver(): void {
    this.screensaverActive = false;
    this.controlsVisible = true;

    if (this.screensaverIntervalId) {
      clearInterval(this.screensaverIntervalId);
      this.screensaverIntervalId = null;
    }
  }

  private showNextScreensaverRoom(): void {
    const backgroundRoomValues = new Set(this.roomBackgrounds.map((background) => background.roomValue));
    const carouselItems = this.navItems.filter((item) => item.value && backgroundRoomValues.has(item.value));
    if (!carouselItems.length) {
      return;
    }

    const currentIndex = carouselItems.findIndex((item) => item.value === this.activeRoomValue);
    const nextItem = carouselItems[(currentIndex + 1) % carouselItems.length] ?? carouselItems[0];
    if (!nextItem.value || nextItem.value === this.activeRoomValue) {
      return;
    }

    this.transitionToRoom(nextItem.value, nextItem.label, false);
  }

  private syncDashboardPresence(entities: Record<string, HassEntityState>): void {
    const entityId = this.dashboardSettings.screensaverEntityId;
    if (!entityId) return;
    const dashboardPresence = entities[entityId];
    if (!dashboardPresence) {
      return;
    }

    const nextPresenceActive = dashboardPresence.state === this.dashboardSettings.screensaverActiveState;
    const presenceChanged = !this.dashboardPresenceInitialized || this.dashboardPresenceActive !== nextPresenceActive;
    this.dashboardPresenceInitialized = true;
    this.dashboardPresenceActive = nextPresenceActive;

    if (presenceChanged && nextPresenceActive && this.screensaverActive) this.wakeFromScreensaver();
  }

  private returnToDefaultRoom(): void {
    const defaultItem =
      this.navItems.find((item) => item.value === 'entree') ??
      this.navItems.find((item) => item.value === 'accueil') ??
      FALLBACK_NAV_ITEMS.find((item) => item.value === 'entree') ??
      FALLBACK_NAV_ITEMS[0];

    if (!defaultItem) {
      return;
    }

    this.closeClimatePopout();
    this.closeVacuumSheet();

    if (this.activeRoomValue === defaultItem.value) {
      return;
    }

    this.navItems = this.navItems.map((item) => ({
      ...item,
      active: item.value === defaultItem.value
    }));

    this.controlsVisible = false;

    this.transitionToRoom(defaultItem.value ?? DEFAULT_ROOM_VALUE, defaultItem.label, true);
  }

  private syncDashboardState(
    areas: HassAreaRegistryEntry[],
    devices: HassDeviceRegistryEntry[],
    entityRegistry: HassEntityRegistryEntry[],
    entities: Record<string, HassEntityState>,
    services: HassServiceCatalog
  ): void {
    this.updateHomeNotifications(entities);
    this.latestDevices = devices;
    this.latestEntityRegistry = entityRegistry;
    this.latestEntities = entities;
    this.navItems = this.buildNavItems(areas);
    this.controlsByRoom = this.buildControlsByRoom(areas, devices, entityRegistry, entities, services);
    this.roomAreaIdsByValue = this.buildRoomAreaIdsByValue(areas);
    this.vacuumSupportsAreaCleaning = this.hasService(services, 'vacuum', 'clean_area');
    this.syncDashboardPresence(entities);

    if (this.overviewActive) {
      this.navItems = this.navItems.map((item) => ({ ...item, active: false }));
      return;
    }

    const availableRoomValue = this.navItems.some((item) => item.value === this.activeRoomValue)
      ? this.activeRoomValue
      : this.navItems[0]?.value ?? 'entree';

    this.navItems = this.navItems.map((item) => ({
      ...item,
      active: item.value === availableRoomValue
    }));

    this.setActiveRoom(availableRoomValue);
  }

  private buildNavItems(areas: HassAreaRegistryEntry[]): NavItem[] {
    if (this.adminRoomsOverride) {
      return this.adminRoomsOverride.map((room, index) => ({
        label: room.name,
        value: room.id,
        floor: room.floor,
        active: room.id === this.activeRoomValue || (!this.activeRoomValue && index === 0),
        icon: room.icon,
        iconStyle: room.iconStyle,
        iconFilled: room.iconFilled,
        controls: room.controls,
        climate: room.climate,
        vacuum: room.vacuum,
        background: room.background
      }));
    }

    if (!areas.length) {
      return FALLBACK_NAV_ITEMS.map((item) => ({
        ...item,
        active: item.value === this.activeRoomValue
      }));
    }

    const orderedAreas = [...areas].sort((left, right) => left.name.localeCompare(right.name));

    return orderedAreas.map((area, index) => {
      const slug = this.slugify(area.name);
      return {
        label: area.name,
        value: slug,
        floor: this.getFloorForRoom(slug),
        active: slug === this.activeRoomValue || (!this.activeRoomValue && index === 0)
      };
    });
  }

  private buildControlsByRoom(
    areas: HassAreaRegistryEntry[],
    devices: HassDeviceRegistryEntry[],
    entityRegistry: HassEntityRegistryEntry[],
    entities: Record<string, HassEntityState>,
    services: HassServiceCatalog
  ): Record<string, DashboardControlItem[]> {
    const controlsByRoom: Record<string, DashboardControlItem[]> = {};
    const areaSlugById = new Map<string, string>();
    const deviceAreaById = new Map<string, string>();

    for (const area of areas) {
      const roomSlug = this.slugify(area.name);
      areaSlugById.set(area.area_id, roomSlug);
    }

    for (const device of devices) {
      if (device.area_id) {
        deviceAreaById.set(device.id, device.area_id);
      }
    }

    for (const entityEntry of entityRegistry) {
      if (entityEntry.disabled_by || entityEntry.hidden_by) {
        continue;
      }

      const areaId = entityEntry.area_id ?? (entityEntry.device_id ? deviceAreaById.get(entityEntry.device_id) : undefined);
      if (!areaId) {
        continue;
      }

      const areaSlug = areaSlugById.get(areaId);
      if (!areaSlug) {
        continue;
      }

      const state = entities[entityEntry.entity_id];
      if (!state) {
        continue;
      }

      const controlItem = this.createControlItem(entityEntry, state, services);
      if (!controlItem) continue;

      controlsByRoom[areaSlug] = [...(controlsByRoom[areaSlug] ?? []), controlItem];
    }

    for (const roomValue of this.navItems.map((item) => item.value ?? '')) {
      if (!roomValue) {
        continue;
      }

      const configuredRoom = this.adminRoomsOverride?.find((room) => room.id === roomValue);
      if (configuredRoom?.controls) {
        controlsByRoom[roomValue] = configuredRoom.controls.flatMap((config) => {
          const entry = entityRegistry.find((candidate) => candidate.entity_id === config.entityId);
          const state = entities[config.entityId];
          if (!entry || !state) return [];
          const control = this.createControlItem(entry, state, services);
          return control ? [{ ...control, name: config.label || control.name, icon: config.icon || control.icon, tapAction: config.tapAction, holdAction: config.holdAction, confirm: config.confirm }] : [];
        });
        continue;
      }

      const roomControls = (controlsByRoom[roomValue] ?? []).sort((left, right) =>
        left.name.localeCompare(right.name, 'fr')
      );

      controlsByRoom[roomValue] = roomControls;
    }

    return controlsByRoom;
  }

  private buildRoomAreaIdsByValue(areas: HassAreaRegistryEntry[]): Record<string, string> {
    return areas.reduce<Record<string, string>>((accumulator, area) => {
      const roomSlug = this.slugify(area.name);
      accumulator[roomSlug] = area.area_id;
      return accumulator;
    }, {});
  }

  private buildRoomClimate(
    entityRegistry: HassEntityRegistryEntry[],
    devices: HassDeviceRegistryEntry[],
    entities: Record<string, HassEntityState>,
    roomValue: string
  ): RoomClimateControl | null {
    const configuredClimate = this.adminRoomsOverride?.find((room) => room.id === roomValue)?.climate;
    if (configuredClimate) {
      if (!configuredClimate.enabled || !configuredClimate.entityId) return null;
      const entry = entityRegistry.find((candidate) => candidate.entity_id === configuredClimate.entityId);
      const state = entities[configuredClimate.entityId];
      if (!entry || !state) return null;
      return this.createRoomClimateControl(entry, state);
    }

    const roomAreaId = this.roomAreaIdsByValue[roomValue];
    if (!roomAreaId) {
      return null;
    }

    const deviceAreaById = new Map<string, string>();
    for (const device of devices) {
      if (device.area_id) {
        deviceAreaById.set(device.id, device.area_id);
      }
    }

    const climateEntry = entityRegistry.find((entry) => {
      if (entry.entity_id.split('.')[0] !== 'climate' || entry.disabled_by || entry.hidden_by) {
        return false;
      }

      const areaId = entry.area_id ?? (entry.device_id ? deviceAreaById.get(entry.device_id) : undefined);
      return areaId === roomAreaId;
    });

    if (!climateEntry) {
      return null;
    }

    const climateState = entities[climateEntry.entity_id];
    if (!climateState) {
      return null;
    }

    return this.createRoomClimateControl(climateEntry, climateState);
  }

  private createRoomClimateControl(entry: HassEntityRegistryEntry, state: HassEntityState): RoomClimateControl {
    const currentTemperature = Number(state.attributes['current_temperature']);
    const targetTemperature = Number(state.attributes['temperature']);
    return {
      entityId: state.entity_id,
      label: this.getDisplayName(entry, state),
      currentTemperature: Number.isFinite(currentTemperature) ? currentTemperature : undefined,
      targetTemperature: Number.isFinite(targetTemperature) ? targetTemperature : undefined,
      minTemperature: Number(state.attributes['min_temp'] ?? 15),
      maxTemperature: Number(state.attributes['max_temp'] ?? 25),
      temperatureStep: Number(state.attributes['target_temp_step'] ?? 0.5),
      status: this.getClimateStatus(state)
    };
  }

  private createControlItem(
    entityEntry: HassEntityRegistryEntry,
    state: HassEntityState,
    services: HassServiceCatalog
  ): DashboardControlItem | null {
    const domain = state.entity_id.split('.')[0];
    const displayName = this.getDisplayName(entityEntry, state);
    const icon = this.getIcon(domain);

    if (this.hasBrightnessSlider(domain, state)) {
      const brightnessPct = this.getBrightnessPercentage(state);
      return {
        id: state.entity_id,
        entityId: state.entity_id,
        name: displayName,
        icon,
        domain,
        state: state.state,
        hasSlider: true,
        sliderValue: brightnessPct,
        sliderMin: 0,
        sliderMax: 100,
        sliderStep: 1,
        lastSliderValue: brightnessPct > 0 ? brightnessPct : 100,
        active: state.state !== 'off' && state.state !== 'closed',
        clickable: this.hasService(services, domain, 'turn_on') || this.hasService(services, domain, 'turn_off')
      };
    }

    if (this.hasPercentageSlider(domain, state)) {
      const percentage = this.getPercentage(state);
      return {
        id: state.entity_id,
        entityId: state.entity_id,
        name: displayName,
        icon,
        domain,
        state: state.state,
        hasSlider: true,
        sliderValue: percentage,
        sliderMin: 0,
        sliderMax: 100,
        sliderStep: 1,
        lastSliderValue: percentage > 0 ? percentage : 100,
        active: state.state !== 'off',
        clickable: this.hasService(services, domain, 'turn_on') || this.hasService(services, domain, 'turn_off')
      };
    }

    if (this.hasPositionSlider(domain, state)) {
      const position = this.getPosition(state);
      return {
        id: state.entity_id,
        entityId: state.entity_id,
        name: displayName,
        icon,
        domain,
        state: state.state,
        hasSlider: true,
        sliderValue: position,
        sliderMin: 0,
        sliderMax: 100,
        sliderStep: 1,
        lastSliderValue: position > 0 ? position : 100,
        active: state.state !== 'closed',
        clickable: this.hasService(services, domain, 'open_cover') || this.hasService(services, domain, 'close_cover')
      };
    }

    if (domain === 'number' || domain === 'input_number') {
      const min = Number(state.attributes['min'] ?? 0);
      const max = Number(state.attributes['max'] ?? 100);
      const step = Number(state.attributes['step'] ?? 1);
      const value = Number(state.state);

      if (Number.isFinite(value)) {
        return {
          id: state.entity_id,
          entityId: state.entity_id,
          name: displayName,
          icon,
          domain,
          state: state.state,
          hasSlider: true,
          sliderValue: value,
          sliderMin: min,
          sliderMax: max,
          sliderStep: step,
          lastSliderValue: value,
          active: true,
          clickable: false
        };
      }
    }

    if (!this.isControllableDomain(domain, services)) {
      return null;
    }

    return {
      id: state.entity_id,
      entityId: state.entity_id,
      name: displayName,
      icon,
      domain,
      state: state.state,
      value: this.getValueLabel(domain, state),
      active: this.isActiveState(domain, state.state),
      clickable: true
    };
  }

  private async handleControlClick(item: DashboardControlItem): Promise<void> {
    switch (item.domain) {
      case 'light':
      case 'switch':
      case 'input_boolean':
      case 'fan':
      case 'humidifier':
        await this.togglePowerEntity(item);
        return;
      case 'lock':
        await this.toggleLock(item);
        return;
      case 'cover':
        await this.toggleCover(item);
        return;
      case 'scene':
      case 'script':
        await this.hass.callService(item.domain, 'turn_on', item.entityId);
        return;
      case 'button':
        await this.hass.callService(item.domain, 'press', item.entityId);
        return;
      case 'media_player':
        await this.toggleMediaPlayer(item);
        return;
      default:
        return;
    }
  }

  private async handleConfiguredControlAction(item: DashboardControlItem, action: 'toggle' | 'turn_on' | 'turn_off'): Promise<void> {
    if (item.confirm && !window.confirm(`Confirmer l’action sur « ${item.name} »?`)) return;
    if (action === 'toggle') { await this.handleControlClick(item); return; }
    if (['light','switch','input_boolean','fan','humidifier','media_player'].includes(item.domain)) {
      await this.hass.callService(item.domain, action, item.entityId);
      return;
    }
    if (item.domain === 'cover') await this.hass.callService('cover', action === 'turn_on' ? 'open_cover' : 'close_cover', item.entityId);
    else if (item.domain === 'lock') await this.hass.callService('lock', action === 'turn_on' ? 'unlock' : 'lock', item.entityId);
  }

  private scheduleSliderUpdate(item: DashboardControlItem, value: number): void {
    const existingTimer = this.sliderUpdateTimers.get(item.entityId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.applyOptimisticSliderState(item, value);

    const timer = setTimeout(() => {
      this.sliderUpdateTimers.delete(item.entityId);
      void this.commitSliderState(item, value);
    }, 150);

    this.sliderUpdateTimers.set(item.entityId, timer);
  }

  private async commitSliderState(item: DashboardControlItem, value: number): Promise<void> {
    switch (item.domain) {
      case 'light':
        if (value <= 0) {
          await this.hass.callService('light', 'turn_off', item.entityId);
        } else {
          await this.hass.callService('light', 'turn_on', item.entityId, { brightness_pct: Math.round(value) });
        }
        return;
      case 'fan':
        if (value <= 0) {
          await this.hass.callService('fan', 'turn_off', item.entityId);
        } else {
          await this.hass.callService('fan', 'set_percentage', item.entityId, { percentage: Math.round(value) });
        }
        return;
      case 'cover':
        await this.hass.callService('cover', 'set_cover_position', item.entityId, { position: Math.round(value) });
        return;
      case 'number':
      case 'input_number':
        await this.hass.callService(item.domain, 'set_value', item.entityId, { value });
        return;
      default:
        return;
    }
  }

  private async commitClimateTarget(value: number): Promise<void> {
    if (!this.currentRoomClimate) {
      return;
    }

    this.hass.patchEntityState(
      this.currentRoomClimate.entityId,
      {},
      {
        temperature: value
      }
    );

    await this.hass.callService('climate', 'set_temperature', this.currentRoomClimate.entityId, {
      temperature: value
    });
  }

  private updateClimateFromDialPointer(event: PointerEvent, svg: SVGSVGElement): void {
    if (!this.currentRoomClimate) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * 240;
    const relativeY = ((event.clientY - rect.top) / rect.height) * 190;
    const rawAngle = (Math.atan2(relativeY - this.climateDialCenterY, relativeX - this.climateDialCenterX) * 180) / Math.PI;
    const normalizedAngle = rawAngle < this.climateDialStartAngle ? rawAngle + 360 : rawAngle;
    const clampedAngle = Math.min(
      this.climateDialStartAngle + this.climateDialSweep,
      Math.max(this.climateDialStartAngle, normalizedAngle)
    );
    const progress = (clampedAngle - this.climateDialStartAngle) / this.climateDialSweep;
    const nextTemperature = this.roundClimateTemperatureForDisplay(
      this.currentRoomClimate.minTemperature +
        progress * (this.currentRoomClimate.maxTemperature - this.currentRoomClimate.minTemperature)
    );

    this.currentRoomClimate = {
      ...this.currentRoomClimate,
      targetTemperature: nextTemperature
    };

    this.scheduleClimateCommit(nextTemperature);
  }

  private scheduleClimateCommit(value: number): void {
    if (this.climateCommitTimeoutId) {
      clearTimeout(this.climateCommitTimeoutId);
    }

    this.climateCommitTimeoutId = setTimeout(() => {
      this.climateCommitTimeoutId = null;
      void this.commitClimateTarget(this.roundClimateTemperatureForCommit(value));
    }, 120);
  }

  private roundClimateTemperatureForDisplay(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private roundClimateTemperatureForCommit(value: number): number {
    if (!this.currentRoomClimate) {
      return value;
    }

    const step = 0.5;
    return Math.round(value / step) * step;
  }

  private getDialPoint(angle: number): { x: number; y: number } {
    const angleInRadians = (angle * Math.PI) / 180;
    return {
      x: this.climateDialCenterX + this.climateDialRadius * Math.cos(angleInRadians),
      y: this.climateDialCenterY + this.climateDialRadius * Math.sin(angleInRadians)
    };
  }

  private async togglePowerEntity(item: DashboardControlItem): Promise<void> {
    const turnOn = Boolean(item.active);
    const service = turnOn ? 'turn_on' : 'turn_off';

    this.hass.patchEntityState(
      item.entityId,
      {
        state: turnOn ? 'on' : 'off'
      },
      item.domain === 'light'
        ? (turnOn ? {} : { brightness: 0 })
        : item.domain === 'fan'
          ? { percentage: turnOn ? Math.max(1, Math.round(item.lastSliderValue ?? item.sliderValue ?? 100)) : 0 }
          : {}
    );

    await this.hass.callService(item.domain, service, item.entityId);
  }

  private async toggleLock(item: DashboardControlItem): Promise<void> {
    const shouldUnlock = item.state === 'locked' || item.state === 'locking';
    this.hass.patchEntityState(item.entityId, {
      state: shouldUnlock ? 'unlocked' : 'locked'
    });
    await this.hass.callService('lock', shouldUnlock ? 'unlock' : 'lock', item.entityId);
  }

  private async toggleCover(item: DashboardControlItem): Promise<void> {
    const shouldOpen = item.state === 'closed' || item.state === 'closing';
    this.hass.patchEntityState(
      item.entityId,
      {
        state: shouldOpen ? 'open' : 'closed'
      },
      { current_position: shouldOpen ? Math.max(1, Math.round(item.lastSliderValue ?? item.sliderValue ?? 100)) : 0 }
    );
    await this.hass.callService('cover', shouldOpen ? 'open_cover' : 'close_cover', item.entityId);
  }

  private async toggleMediaPlayer(item: DashboardControlItem): Promise<void> {
    const shouldTurnOn = item.state === 'off' || item.state === 'standby';
    this.hass.patchEntityState(item.entityId, {
      state: shouldTurnOn ? 'on' : 'off'
    });
    await this.hass.callService('media_player', shouldTurnOn ? 'turn_on' : 'turn_off', item.entityId);
  }

  private applyOptimisticSliderState(item: DashboardControlItem, value: number): void {
    switch (item.domain) {
      case 'light':
        this.hass.patchEntityState(
          item.entityId,
          {
            state: value <= 0 ? 'off' : 'on'
          },
          {
            brightness: Math.round((Math.max(0, value) / 100) * 255)
          }
        );
        return;
      case 'fan':
        this.hass.patchEntityState(
          item.entityId,
          {
            state: value <= 0 ? 'off' : 'on'
          },
          {
            percentage: Math.round(Math.max(0, value))
          }
        );
        return;
      case 'cover':
        this.hass.patchEntityState(
          item.entityId,
          {
            state: value <= 0 ? 'closed' : 'open'
          },
          {
            current_position: Math.round(Math.max(0, value))
          }
        );
        return;
      case 'number':
      case 'input_number':
        this.hass.patchEntityState(item.entityId, {
          state: String(value)
        });
        return;
      default:
        return;
    }
  }

  private setActiveRoom(roomValue: string, fallbackLabel?: string): void {
    const roomChanged = this.activeRoomValue !== roomValue;
    this.activeRoomValue = roomValue;
    if (roomValue !== '__overview__') this.lastRoomValue = roomValue;
    this.activeControls = this.controlsByRoom[roomValue] ?? [];
    this.currentRoomClimate = this.buildRoomClimate(
      this.latestEntityRegistry,
      this.latestDevices,
      this.latestEntities,
      roomValue
    );
    this.vacuumControl = this.buildVacuumControl(this.latestEntityRegistry, this.latestEntities);
    this.vacuumActionChip = this.vacuumControl
      ? {
          label: this.vacuumControl.label,
          active: this.vacuumControl.isActive
        }
      : null;
    this.syncVacuumReturnOverride();

    if (roomChanged) {
      this.climatePopoutOpen = false;
      this.climatePopoutClosing = false;
      if (this.climatePopoutCloseTimeoutId) {
        clearTimeout(this.climatePopoutCloseTimeoutId);
        this.climatePopoutCloseTimeoutId = null;
      }
    }

    if (!this.vacuumControl) {
      this.vacuumSheetOpen = false;
    }

    const selectedNavItem = this.navItems.find((item) => item.value === roomValue);
    this.roomName = selectedNavItem?.label ?? fallbackLabel ?? this.roomName;
  }

  private hasBrightnessSlider(domain: string, state: HassEntityState): boolean {
    return domain === 'light' && state.attributes['brightness'] !== undefined;
  }

  private hasPercentageSlider(domain: string, state: HassEntityState): boolean {
    return domain === 'fan' && state.attributes['percentage'] !== undefined;
  }

  private hasPositionSlider(domain: string, state: HassEntityState): boolean {
    return domain === 'cover' && (state.attributes['current_position'] !== undefined || state.attributes['position'] !== undefined);
  }

  private getBrightnessPercentage(state: HassEntityState): number {
    const brightness = Number(state.attributes['brightness'] ?? 0);
    return Math.round((brightness / 255) * 100);
  }

  private getPercentage(state: HassEntityState): number {
    return Math.round(Number(state.attributes['percentage'] ?? 0));
  }

  private getPosition(state: HassEntityState): number {
    return Math.round(Number(state.attributes['current_position'] ?? state.attributes['position'] ?? 0));
  }

  private isControllableDomain(domain: string, services: HassServiceCatalog): boolean {
    if (domain === 'number' || domain === 'input_number') {
      return true;
    }

    return Boolean(services[domain]) && [
      'light',
      'switch',
      'input_boolean',
      'fan',
      'humidifier',
      'lock',
      'cover',
      'scene',
      'script',
      'button',
      'media_player'
    ].includes(domain);
  }

  private hasService(services: HassServiceCatalog, domain: string, service: string): boolean {
    return Boolean(services[domain]?.[service]);
  }

  private isActiveState(domain: string, state: string): boolean {
    switch (domain) {
      case 'lock':
        return state === 'unlocked' || state === 'unlocking';
      case 'cover':
        return state !== 'closed';
      case 'scene':
      case 'script':
      case 'button':
        return false;
      default:
        return !['off', 'closed', 'idle', 'standby', 'unavailable', 'unknown'].includes(state);
    }
  }

  private getValueLabel(domain: string, state: HassEntityState): string {
    if (domain === 'lock') {
      switch (state.state) {
        case 'locked':
          return 'Verrouillé';
        case 'unlocked':
          return 'Déverrouillé';
        case 'unlocking':
          return 'Déverrouillage';
        case 'locking':
          return 'Verrouillage';
        default:
          return this.capitalizeWords(state.state.replace(/_/g, ' '));
      }
    }

    if (domain === 'cover' && (state.attributes['current_position'] !== undefined || state.attributes['position'] !== undefined)) {
      return `${Math.round(Number(state.attributes['current_position'] ?? state.attributes['position'] ?? 0))}%`;
    }

    const translated = ({ off: 'Éteint', on: 'Allumé', unavailable: 'Indisponible', unknown: 'Inconnu', standby: 'En veille', idle: 'En veille' } as Record<string,string>)[state.state.toLowerCase()];
    return translated ?? this.capitalizeWords(state.state.replace(/_/g, ' '));
  }

  private getDisplayName(entityEntry: HassEntityRegistryEntry, state: HassEntityState): string {
    return (
      state.attributes['friendly_name'] ||
      entityEntry.name ||
      entityEntry.original_name ||
      this.humanizeEntityId(state.entity_id)
    );
  }

  private getIcon(domain: string): string {
    switch (domain) {
      case 'light':
        return 'light';
      case 'switch':
      case 'input_boolean':
        return 'toggle_on';
      case 'fan':
        return 'mode_fan';
      case 'humidifier':
        return 'humidity_mid';
      case 'lock':
        return 'lock';
      case 'cover':
        return 'blinds';
      case 'scene':
        return 'movie';
      case 'script':
        return 'play_arrow';
      case 'button':
        return 'radio_button_checked';
      case 'media_player':
        return 'tv_gen';
      case 'number':
      case 'input_number':
        return 'tune';
      default:
        return 'settings_remote';
    }
  }

  private humanizeEntityId(entityId: string): string {
    const objectId = entityId.split('.')[1] ?? entityId;
    return this.capitalizeWords(objectId.replace(/_/g, ' '));
  }

  private capitalizeWords(value: string): string {
    return value.replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private getClimateStatus(state: HassEntityState): string {
    const hvacAction = state.attributes['hvac_action'];
    if (typeof hvacAction === 'string' && hvacAction.length > 0) {
      return this.translateClimateStatus(hvacAction);
    }

    return this.translateClimateStatus(state.state);
  }

  private updateHomeNotifications(entities: Record<string, HassEntityState>): void {
    const preferences = this.dashboardSettings.notifications;
    const doorbellId = this.dashboardSettings.security.enabled ? this.dashboardSettings.security.doorbellEntityId : '';
    const doorbell = doorbellId ? entities[doorbellId] : undefined;
    if (doorbell) {
      const marker = `${doorbell.state}:${doorbell.last_updated || doorbell.last_changed || ''}`;
      const active = doorbell.entity_id.startsWith('event.') ? !['unknown','unavailable'].includes(doorbell.state) : ['on','pressed','ringing','detected'].includes(doorbell.state);
      if (this.previousDoorbellMarker && marker !== this.previousDoorbellMarker && active) {
        this.doorbellOpen = true;
        if (this.doorbellTimeoutId) clearTimeout(this.doorbellTimeoutId);
        this.doorbellTimeoutId = setTimeout(() => this.closeDoorbell(), this.dashboardSettings.security.doorbellDurationSeconds * 1000);
      }
      this.previousDoorbellMarker = marker;
    }
    const dashboardEntities = this.importantDashboardEntityIds;
    const important = Object.values(entities).filter((entity) => {
      const domain = entity.entity_id.split('.')[0];
      const deviceClass = String(entity.attributes['device_class'] || '');
      const security = preferences.security && (domain === 'lock' || (domain === 'binary_sensor' && ['door','window','garage_door','opening'].includes(deviceClass)));
      const safety = preferences.safety && domain === 'binary_sensor' && ['smoke','carbon_monoxide','gas','moisture','safety'].includes(deviceClass);
      const criticalDevice = preferences.criticalDevices && dashboardEntities.has(entity.entity_id) && ['unavailable','unknown'].includes(entity.state);
      return security || safety || criticalDevice;
    });
    if (!this.notificationsInitialized) {
      for (const entity of important) this.previousImportantStates[entity.entity_id] = entity.state;
      this.notificationsInitialized = true;
      return;
    }
    for (const entity of important) {
      const previous = this.previousImportantStates[entity.entity_id];
      this.previousImportantStates[entity.entity_id] = entity.state;
      if (!previous || previous === entity.state) continue;
      const friendlyName = String(entity.attributes['friendly_name'] || this.humanizeEntityId(entity.entity_id));
      let toast: Omit<HomeToast, 'id'> | null = null;
      if (entity.entity_id.startsWith('lock.') && entity.state === 'unlocked') toast = { icon: 'lock_open', title: friendlyName, detail: 'Déverrouillée' };
      else if (entity.entity_id.startsWith('binary_sensor.') && entity.state === 'on') toast = { icon: 'door_open', title: friendlyName, detail: 'Ouverte' };
      else if (entity.state === 'unavailable') toast = { icon: 'cloud_off', title: friendlyName, detail: 'Appareil indisponible' };
      if (toast) {
        const item = { ...toast, id: ++this.toastSequence };
        this.homeToasts = [...this.homeToasts.slice(-2), item];
        const safetyAlert = ['smoke','carbon_monoxide','gas','moisture','safety'].includes(String(entity.attributes['device_class'] || ''));
        setTimeout(() => this.homeToasts = this.homeToasts.filter((candidate) => candidate.id !== item.id), (safetyAlert ? 12 : preferences.durationSeconds) * 1000);
      }
    }
  }

  private showOfflineToast(): void {
    if (!this.dashboardSettings.notifications.system) return;
    const item: HomeToast = { id: ++this.toastSequence, icon: 'cloud_off', title: 'Mode hors ligne', detail: 'Cette action sera disponible après la reconnexion.' };
    this.homeToasts = [...this.homeToasts.slice(-2), item];
    setTimeout(() => this.homeToasts = this.homeToasts.filter((candidate) => candidate.id !== item.id), 3500);
  }

  private showActionToast(title: string, detail: string, tone: 'success' | 'error' = 'success'): void {
    const item: HomeToast = { id: ++this.toastSequence, icon: tone === 'success' ? 'check_circle' : 'error', title, detail };
    this.homeToasts = [...this.homeToasts.slice(-2), item];
    setTimeout(() => this.homeToasts = this.homeToasts.filter((candidate) => candidate.id !== item.id), 2200);
  }

  private translateClimateStatus(value: string): string {
    const normalized = value.trim().toLowerCase();
    const translated = {
      heating: 'Chauffage',
      cooling: 'Climatisation',
      idle: 'En veille',
      off: 'Éteint',
      fan: 'Ventilation',
      drying: 'Déshumidification',
      defrosting: 'Dégivrage',
      preheating: 'Préchauffage',
      heat: 'Chauffage',
      cool: 'Climatisation',
      auto: 'Auto',
      dry: 'Déshumidification',
      heat_cool: 'Auto',
      fan_only: 'Ventilation'
    }[normalized];

    return translated ?? this.capitalizeWords(normalized.replace(/_/g, ' '));
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private getFloorForRoom(roomValue: string): Floor {
    return this.navItems.find((item) => item.value === roomValue)?.floor ?? this.dashboardFloors[0]?.id ?? 'main';
  }

  private buildVacuumControl(
    entityRegistry: HassEntityRegistryEntry[],
    entities: Record<string, HassEntityState>
  ): VacuumControl | null {
    const configuredVacuum = this.adminRoomsOverride?.find((room) => room.id === this.activeRoomValue)?.vacuum;
    if (!configuredVacuum?.enabled || !configuredVacuum.entityId) return null;
    const entry = entityRegistry.find((candidate) => candidate.entity_id === configuredVacuum.entityId);
    const state = entities[configuredVacuum.entityId];
    if (!entry || !state) return null;
    return { entityId: state.entity_id, label: this.getDisplayName(entry, state), state: state.state, isActive: ['cleaning', 'returning', 'paused'].includes(state.state) };
  }

  get vacuumStatusLabel(): string {
    if (!this.vacuumControl) {
      return '';
    }

    switch (this.vacuumControl.state) {
      case 'cleaning':
        return 'Nettoyage en cours';
      case 'returning':
        return 'Retour à la base';
      case 'paused':
        return 'En pause';
      case 'docked':
        return 'À la base';
      default:
        return this.capitalizeWords(this.vacuumControl.state.replace(/_/g, ' '));
    }
  }

  get vacuumIndicatorState(): 'cleaning' | 'paused' | 'docked' {
    switch (this.vacuumControl?.state) {
      case 'cleaning':
        return 'cleaning';
      case 'paused':
        return 'paused';
      default:
        return 'docked';
    }
  }

  get canStartVacuum(): boolean {
    const canStart =
      Boolean(this.vacuumControl) &&
      ['docked', 'idle', 'paused', 'returning'].includes(this.vacuumControl?.state ?? '') &&
      (this.canUseT50RoomCommand || (this.vacuumSupportsAreaCleaning && Boolean(this.currentRoomAreaId)));

    return canStart;
  }

  get canStartVacuumForFloor(): boolean {
    const canStart =
      Boolean(this.vacuumControl) &&
      ['docked', 'idle', 'paused', 'returning'].includes(this.vacuumControl?.state ?? '');

    return canStart;
  }

  get canPauseVacuum(): boolean {
    return Boolean(this.vacuumControl) && this.vacuumControl?.state === 'cleaning';
  }

  get canDockVacuum(): boolean {
    return Boolean(this.vacuumControl) && !['docked', 'returning'].includes(this.vacuumControl?.state ?? '');
  }

  async startVacuum(): Promise<void> {
    if (!this.vacuumControl) {
      console.log('[vacuum] startVacuum skipped: no selected vacuum', {
        activeRoomValue: this.activeRoomValue
      });
      return;
    }

    this.hass.patchEntityState(this.vacuumControl.entityId, { state: 'cleaning' });

    if (this.canUseT50RoomCommand && this.currentT50RoomCode) {
      console.log('[vacuum] Starting T50 room cleaning via send_command workaround', {
        vacuumEntityId: this.vacuumControl.entityId,
        vacuumLabel: this.vacuumControl.label,
        activeRoomValue: this.activeRoomValue,
        roomCode: this.currentT50RoomCode,
        service: 'vacuum.send_command',
        command: 'clean_V2'
      });
      await this.hass.callService('vacuum', 'send_command', this.vacuumControl.entityId, {
        command: 'clean_V2',
        params: {
          act: 'start',
          content: {
            type: 'freeClean',
            value: this.currentT50RoomCode
          }
        }
      }, { useTarget: true });
      this.vacuumSheetOpen = false;
      return;
    }

    if (!this.vacuumSupportsAreaCleaning || !this.currentRoomAreaId) {
      console.log('[vacuum] startVacuum blocked: room cleaning unavailable, refusing full-clean fallback', {
        vacuumEntityId: this.vacuumControl.entityId,
        vacuumLabel: this.vacuumControl.label,
        activeRoomValue: this.activeRoomValue,
        vacuumSupportsAreaCleaning: this.vacuumSupportsAreaCleaning,
        currentRoomAreaId: this.currentRoomAreaId
      });
      return;
    }

    console.log('[vacuum] Starting room cleaning via HA area mapping', {
      vacuumEntityId: this.vacuumControl.entityId,
      vacuumLabel: this.vacuumControl.label,
      activeRoomValue: this.activeRoomValue,
      roomAreaId: this.currentRoomAreaId,
      service: 'vacuum.clean_area'
    });
    await this.hass.callService('vacuum', 'clean_area', this.vacuumControl.entityId, {
      cleaning_area_id: [this.currentRoomAreaId]
    });
    this.vacuumSheetOpen = false;
  }

  async startVacuumForFloor(): Promise<void> {
    if (!this.vacuumControl) {
      console.log('[vacuum] startVacuumForFloor skipped: no selected vacuum', {
        currentFloor: this.currentFloorLabel
      });
      return;
    }

    this.hass.patchEntityState(this.vacuumControl.entityId, { state: 'cleaning' });
    console.log('[vacuum] Starting floor cleaning with vacuum.start', {
      vacuumEntityId: this.vacuumControl.entityId,
      vacuumLabel: this.vacuumControl.label,
      currentFloor: this.currentFloorLabel,
      service: 'vacuum.start'
    });
    await this.hass.callService('vacuum', 'start', this.vacuumControl.entityId);
    this.vacuumSheetOpen = false;
  }

  async pauseVacuum(): Promise<void> {
    if (!this.vacuumControl) {
      console.log('[vacuum] pauseVacuum skipped: no selected vacuum');
      return;
    }

    this.hass.patchEntityState(this.vacuumControl.entityId, { state: 'paused' });
    console.log('[vacuum] Pausing vacuum', {
      vacuumEntityId: this.vacuumControl.entityId,
      vacuumLabel: this.vacuumControl.label
    });
    await this.hass.callService('vacuum', 'pause', this.vacuumControl.entityId);
    this.vacuumSheetOpen = false;
  }

  async dockVacuum(): Promise<void> {
    if (!this.vacuumControl) {
      console.log('[vacuum] dockVacuum skipped: no selected vacuum');
      return;
    }

    this.hass.patchEntityState(this.vacuumControl.entityId, { state: 'returning' });
    console.log('[vacuum] Returning vacuum to base', {
      vacuumEntityId: this.vacuumControl.entityId,
      vacuumLabel: this.vacuumControl.label
    });
    await this.hass.callService('vacuum', 'return_to_base', this.vacuumControl.entityId);
    this.vacuumSheetOpen = false;
  }

  private syncVacuumReturnOverride(): void {
    if (this.vacuumReturnOverrideTimeoutId) {
      clearTimeout(this.vacuumReturnOverrideTimeoutId);
      this.vacuumReturnOverrideTimeoutId = null;
    }

    if (!this.vacuumControl || this.vacuumControl.state !== 'returning') {
      return;
    }

    const vacuumEntityId = this.vacuumControl.entityId;
    console.log('[vacuum] Scheduling returning->docked override', {
      vacuumEntityId,
      delayMs: this.vacuumReturnOverrideDurationMs
    });

    this.vacuumReturnOverrideTimeoutId = setTimeout(() => {
      this.vacuumReturnOverrideTimeoutId = null;
      const latestVacuumState = this.latestEntities[vacuumEntityId]?.state;
      if (latestVacuumState !== 'returning') {
        return;
      }

      console.log('[vacuum] Overriding stuck returning state to docked', {
        vacuumEntityId
      });
      this.hass.patchEntityState(vacuumEntityId, { state: 'docked' });
    }, this.vacuumReturnOverrideDurationMs);
  }

  get currentRoomAreaId(): string | undefined {
    return this.roomAreaIdsByValue[this.activeRoomValue];
  }

  get currentT50RoomCode(): string | undefined {
    const configured = this.adminRoomsOverride?.find((room) => room.id === this.activeRoomValue)?.vacuum?.roomParameter;
    return configured || undefined;
  }

  get canUseT50RoomCommand(): boolean {
    return Boolean(this.vacuumControl?.entityId && this.currentT50RoomCode);
  }

  get currentFloorAreaIds(): string[] {
    const currentFloor = this.navItems.find((item) => item.value === this.activeRoomValue)?.floor ?? 'main';

    return this.navItems
      .filter((item) => item.floor === currentFloor)
      .map((item) => item.value)
      .filter((value): value is string => Boolean(value))
      .map((value) => this.roomAreaIdsByValue[value])
      .filter((areaId): areaId is string => Boolean(areaId));
  }

  get currentFloorLabel(): string {
    const currentFloor = this.navItems.find((item) => item.value === this.activeRoomValue)?.floor ?? 'main';
    return this.dashboardFloors.find((floor) => floor.id === currentFloor)?.name ?? currentFloor;
  }

  private updateClock(): void {
    const now = new Date();
    this.now = now.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: !this.dashboardSettings.clock24h });
  }

  private applyInterfaceSettings(): void { document.documentElement.style.fontSize = `${16 * Math.min(1.25, Math.max(.85, this.dashboardSettings.fontScale))}px`; this.updateClock(); }
}
