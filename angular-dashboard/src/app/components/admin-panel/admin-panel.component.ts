import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavItem } from '../../models/NavItem';
import { DashboardApiService } from '../../service/dashboard-api.service';
import type { DashboardBackup, DashboardDevice, DashboardFloor, DashboardSettings, HassConnectionStatus, SystemHealth } from '../../service/dashboard-api.service';

export interface AdminRoom {
  id: string;
  name: string;
  floor: string;
  icon: string;
  iconStyle: 'outlined' | 'rounded' | 'sharp';
  iconFilled: boolean;
  controls?: AdminRoomControl[];
  climate?: { enabled: boolean; entityId: string };
  vacuum?: { enabled: boolean; entityId: string; roomParameter: string };
  background?: AdminRoomBackground;
}
export interface AdminRoomControl { id: string; label: string; entityId: string; icon: string; tapAction?: 'toggle' | 'turn_on' | 'turn_off'; holdAction?: 'none' | 'toggle' | 'turn_on' | 'turn_off'; confirm?: boolean; }
export interface AdminRoomBackground { url: string; positionX: number; positionY: number; brightness: number; saturation: number; contrast: number; overlay: number; }

export interface AdminEntityOption { entityId: string; name: string; state: string; }
type TechnicalHealthGroup = { id: string; label: string; icon: string; total: number; healthy: number; issues: AdminEntityOption[]; detail: string };
export interface AdminSavePayload { rooms: AdminRoom[]; floors: DashboardFloor[]; settings: DashboardSettings; deviceDefaultFloorId: string; }
const DEFAULT_SETTINGS: DashboardSettings = { homeName: 'La maison', screensaverEntityId: 'input_boolean.dashboard', screensaverActiveState: 'on', fontScale: 1, glassOpacity: 1, reducedMotion: false, clock24h: true, tabletMode: false, inactivityMinutes: 5, notifications: { security: true, safety: true, criticalDevices: true, system: true, durationSeconds: 5 }, security: { enabled: false, cameras: [], doorbellEntityId: '', doorbellCameraEntityId: '', doorLockEntityId: '', entryLightEntityId: '', doorbellDurationSeconds: 25 } };

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.scss'
})
export class AdminPanelComponent implements OnChanges, OnInit {
  private draftInitialized = false;
  @Input() rooms: NavItem[] = [];
  @Input() entities: AdminEntityOption[] = [];
  @Input() floors: DashboardFloor[] = [];
  @Input() settings: DashboardSettings = DEFAULT_SETTINGS;
  @Input() deviceDefaultFloorId = 'main';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<AdminSavePayload>();

  activeSection: 'rooms' | 'security' | 'video' | 'notifications' | 'connection' | 'system' | 'appearance' = 'rooms';
  draftRooms: AdminRoom[] = [];
  draftFloors: DashboardFloor[] = [];
  selectedRoomId = '';
  saveState: 'idle' | 'saved' = 'idle';
  icons: string[] = [];
  iconQuery = '';
  iconPickerOpen = false;
  iconsLoading = false;
  favoriteIcons: string[] = [];
  iconLimit = 300;
  draftSettings: DashboardSettings = structuredClone(DEFAULT_SETTINGS);
  draftDeviceDefaultFloorId = 'main';
  newPin = '';
  confirmPin = '';
  pinMessage = '';
  pinSaving = false;
  entityPickerOpen = false;
  entityQuery = '';
  entityPickerMode: 'presence' | 'control' | 'climate' | 'vacuum' | 'securityCamera' | 'doorbell' | 'doorbellCamera' | 'doorLock' | 'entryLight' = 'presence';
  entityPickerControlIndex = -1;
  iconPickerControlIndex = -1;
  backgroundUploading = false;
  backgroundMessage = '';
  systemHealth: SystemHealth | null = null;
  backups: DashboardBackup[] = [];
  systemLoading = false;
  systemMessage = '';
  draggedRoomId = '';
  draggedControlIndex = -1;
  floorManagerOpen = false;
  hassStatus: HassConnectionStatus | null = null;
  hassUrl = '';
  hassToken = '';
  hassSaving = false;
  hassMessage = '';
  devices: DashboardDevice[] = [];
  deviceName = 'Tablette principale';
  pairingCode = '';
  deviceMessage = '';
  devicesLoading = false;

  constructor(private readonly api: DashboardApiService) {}

  ngOnInit(): void {
    try { this.favoriteIcons = JSON.parse(localStorage.getItem('dashboard-favorite-icons') || '[]'); } catch {}
    void this.loadDevices();
  }

  async loadDevices(): Promise<void> {
    this.devicesLoading = true;
    try { this.devices = await this.api.getDevices(); } catch { this.deviceMessage = 'Impossible de charger les appareils.'; }
    finally { this.devicesLoading = false; }
  }

  async trustCurrentDevice(): Promise<void> {
    this.deviceMessage = '';
    try { await this.api.trustCurrentDevice(this.deviceName); this.deviceMessage = 'Cet appareil est maintenant autorisé.'; await this.loadDevices(); }
    catch { this.deviceMessage = 'Impossible d’autoriser cet appareil.'; }
  }

  async createPairingCode(): Promise<void> {
    try { this.pairingCode = await this.api.createPairingCode(); this.deviceMessage = 'Code valide pendant 10 minutes.'; }
    catch { this.deviceMessage = 'Impossible de créer un code.'; }
  }

  async revokeDevice(device: DashboardDevice): Promise<void> {
    if (!window.confirm(`Révoquer l’accès de « ${device.name} »?`)) return;
    try { await this.api.revokeDevice(device.id); await this.loadDevices(); }
    catch { this.deviceMessage = 'La révocation a échoué.'; }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rooms'] && !this.draftInitialized) {
      this.draftRooms = this.rooms.map((room) => ({
        id: room.value ?? this.slugify(room.label),
        name: room.label,
        floor: room.floor ?? 'main',
        icon: (room as NavItem & { icon?: string }).icon || 'meeting_room',
        iconStyle: (room as NavItem & { iconStyle?: AdminRoom['iconStyle'] }).iconStyle || 'outlined',
        iconFilled: (room as NavItem & { iconFilled?: boolean }).iconFilled || false,
        controls: (room as NavItem & { controls?: AdminRoomControl[] }).controls?.map((control) => ({ ...control })),
        climate: (room as NavItem & { climate?: AdminRoom['climate'] }).climate ? { ...(room as any).climate } : undefined,
        vacuum: (room as NavItem & { vacuum?: AdminRoom['vacuum'] }).vacuum ? { ...(room as any).vacuum } : undefined,
        background: (room as NavItem & { background?: AdminRoomBackground }).background ? { ...(room as any).background } : undefined
      }));
      this.selectedRoomId = this.draftRooms[0]?.id ?? '';
      this.draftInitialized = true;
    }
    if (changes['settings'] && changes['settings'].firstChange) this.draftSettings = { ...this.settings, notifications: { ...DEFAULT_SETTINGS.notifications, ...this.settings.notifications }, security: { ...DEFAULT_SETTINGS.security, ...this.settings.security, cameras: (this.settings.security?.cameras || []).map((camera) => ({ ...camera })) } };
    if (changes['floors'] && changes['floors'].firstChange) this.draftFloors = this.floors.map((floor) => ({ ...floor }));
    if (changes['deviceDefaultFloorId'] && changes['deviceDefaultFloorId'].firstChange) this.draftDeviceDefaultFloorId = this.deviceDefaultFloorId || 'main';
  }

  get selectedRoom(): AdminRoom | undefined {
    return this.draftRooms.find((room) => room.id === this.selectedRoomId);
  }

  get mainRooms(): AdminRoom[] {
    return this.draftRooms.filter((room) => room.floor === 'main');
  }

  get basementRooms(): AdminRoom[] {
    return this.draftRooms.filter((room) => room.floor === 'basement');
  }

  get floorGroups(): Array<DashboardFloor & { rooms: AdminRoom[] }> {
    return this.draftFloors.map((floor) => ({ ...floor, rooms: this.draftRooms.filter((room) => room.floor === floor.id) }));
  }

  get visibleIcons(): string[] {
    const query = this.normalizeSearch(this.iconQuery);
    const aliases: Record<string, string[]> = {
      lumiere: ['light', 'lamp', 'bulb', 'fluorescent'], porte: ['door', 'lock', 'entry'],
      salon: ['weekend', 'sofa', 'chair', 'tv'], chambre: ['bed', 'bedroom'],
      cuisine: ['kitchen', 'oven', 'microwave', 'counter', 'dining'], salle_de_bain: ['bath', 'shower', 'water'],
      securite: ['security', 'shield', 'lock', 'sensor', 'camera'], temperature: ['thermostat', 'heat', 'ac_unit'],
      aspirateur: ['vacuum', 'cleaning'], fenetre: ['window', 'blinds', 'curtain'], prise: ['outlet', 'power', 'electrical']
    };
    const terms = query ? [query, ...(aliases[query] || [])] : [];
    const matching = query ? this.icons.filter((icon) => terms.some((term) => icon.includes(term))) : this.icons;
    const favorites = this.favoriteIcons.filter((icon) => matching.includes(icon));
    return [...favorites, ...matching.filter((icon) => !favorites.includes(icon))].slice(0, this.iconLimit);
  }

  get visibleEntities(): AdminEntityOption[] {
    const query = this.normalizeSearch(this.entityQuery);
    const domain = (id: string) => id.split('.')[0];
    const allowed = ['securityCamera','doorbellCamera'].includes(this.entityPickerMode) ? ['camera'] : this.entityPickerMode === 'doorbell' ? ['event','binary_sensor','sensor'] : this.entityPickerMode === 'doorLock' ? ['lock'] : this.entityPickerMode === 'entryLight' ? ['light','switch'] : this.entityPickerMode === 'climate' ? ['climate'] : this.entityPickerMode === 'vacuum' ? ['vacuum'] : this.entityPickerMode === 'presence' ? ['input_boolean','binary_sensor','sensor','person','device_tracker'] : null;
    const scoped = allowed ? this.entities.filter((entity) => allowed.includes(domain(entity.entityId))) : this.entities;
    if (!query) return scoped.slice(0, 250);
    return scoped.filter((entity) => this.normalizeSearch(`${entity.name} ${entity.entityId} ${entity.state}`).includes(query)).slice(0, 250);
  }

  get selectedPresenceEntity(): AdminEntityOption | undefined {
    return this.entities.find((entity) => entity.entityId === this.draftSettings.screensaverEntityId);
  }

  get technicalHealthGroups(): TechnicalHealthGroup[] {
    const normalized = (entity: AdminEntityOption) => `${entity.entityId} ${entity.name}`.toLowerCase();
    const unavailable = (entity: AdminEntityOption) => ['unavailable','unknown','offline','not_connected','problem','bad','failed','failure','critical','warning','fault'].includes(String(entity.state).toLowerCase());
    const definitions = [
      { id: 'protect', label: 'Vidéo et NVR', icon: 'videocam', detail: 'Caméras, stockage et enregistrement', matches: (entity: AdminEntityOption) => entity.entityId.startsWith('camera.') || /unifi protect|nvr|network video|disk health|recording/.test(normalized(entity)) },
      { id: 'network', label: 'Réseau UniFi', icon: 'lan', detail: 'Passerelle, switches et points d’accès', matches: (entity: AdminEntityOption) => /unifi|ubiquiti|dream machine|gateway|access point|\buap\b|\busw\b/.test(normalized(entity)) && !entity.entityId.startsWith('camera.') },
      { id: 'power', label: 'Alimentation', icon: 'battery_charging_full', detail: 'UPS, batterie et alimentation du rack', matches: (entity: AdminEntityOption) => /\bups\b|battery backup|onduleur|power failure|mains power/.test(normalized(entity)) },
      { id: 'rack', label: 'Environnement du rack', icon: 'device_thermostat', detail: 'Température, humidité et ventilation', matches: (entity: AdminEntityOption) => /rack|server room|salle.*serveur|cabinet/.test(normalized(entity)) && /temperature|humidity|fan|ventil|thermal/.test(normalized(entity)) }
    ];
    return definitions.map((definition) => {
      const rows = this.entities.filter(definition.matches);
      const issues = rows.filter(unavailable);
      return { id: definition.id, label: definition.label, icon: definition.icon, detail: definition.detail, total: rows.length, healthy: rows.length - issues.length, issues };
    });
  }

  get technicalIssues(): AdminEntityOption[] { return this.technicalHealthGroups.flatMap((group) => group.issues).filter((entity, index, all) => all.findIndex((candidate) => candidate.entityId === entity.entityId) === index); }
  get technicalHealthConfigured(): boolean { return this.technicalHealthGroups.some((group) => group.total > 0); }

  entityLabel(entityId: string): string {
    return this.entities.find((entity) => entity.entityId === entityId)?.name || entityId || 'Choisir une entité';
  }

  backgroundPreview(url: string): string { return this.api.assetUrl(url); }

  async onBackgroundFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const room = this.selectedRoom;
    if (!file || !room) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) {
      this.backgroundMessage = 'Choisissez une image JPEG, PNG ou WebP de moins de 10 Mo.';
      return;
    }
    this.backgroundUploading = true;
    this.backgroundMessage = '';
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const url = await this.api.uploadRoomBackground(room.id, dataUrl);
      room.background = { url, positionX: 50, positionY: 50, brightness: .72, saturation: .9, contrast: 1.02, overlay: .26 };
      this.backgroundMessage = 'Image téléversée. Enregistrez pour l’appliquer.';
      this.saveState = 'idle';
    } catch { this.backgroundMessage = 'Le téléversement a échoué. La session a peut-être expiré.'; }
    finally { this.backgroundUploading = false; input.value = ''; }
  }

  isEntitySelected(entityId: string): boolean {
    if (this.entityPickerMode === 'securityCamera') return this.draftSettings.security.cameras[this.entityPickerControlIndex]?.entityId === entityId;
    if (this.entityPickerMode === 'doorbell') return this.draftSettings.security.doorbellEntityId === entityId;
    if (this.entityPickerMode === 'doorbellCamera') return this.draftSettings.security.doorbellCameraEntityId === entityId;
    if (this.entityPickerMode === 'doorLock') return this.draftSettings.security.doorLockEntityId === entityId;
    if (this.entityPickerMode === 'entryLight') return this.draftSettings.security.entryLightEntityId === entityId;
    if (this.entityPickerMode === 'presence') return this.draftSettings.screensaverEntityId === entityId;
    if (this.entityPickerMode === 'climate') return this.selectedRoom?.climate?.entityId === entityId;
    if (this.entityPickerMode === 'vacuum') return this.selectedRoom?.vacuum?.entityId === entityId;
    return this.selectedRoom?.controls?.[this.entityPickerControlIndex]?.entityId === entityId;
  }

  addRoom(): void {
    const base = 'nouvelle-piece';
    let id = base;
    let suffix = 2;
    while (this.draftRooms.some((room) => room.id === id)) {
      id = `${base}-${suffix++}`;
    }
    this.draftRooms = [...this.draftRooms, { id, name: 'Nouvelle pièce', floor: 'main', icon: 'meeting_room', iconStyle: 'outlined', iconFilled: false, controls: [], climate: { enabled: false, entityId: '' }, vacuum: { enabled: false, entityId: '', roomParameter: '' } }];
    this.selectedRoomId = id;
    this.saveState = 'idle';
  }

  removeSelectedRoom(): void {
    const room = this.selectedRoom;
    if (!room || !window.confirm(`Retirer « ${room.name} » du tableau de bord?`)) {
      return;
    }
    this.draftRooms = this.draftRooms.filter((item) => item.id !== room.id);
    this.selectedRoomId = this.draftRooms[0]?.id ?? '';
    this.saveState = 'idle';
  }

  moveRoom(direction: -1 | 1): void {
    const index = this.draftRooms.findIndex((room) => room.id === this.selectedRoomId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.draftRooms.length) {
      return;
    }
    const next = [...this.draftRooms];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    this.draftRooms = next;
    this.saveState = 'idle';
  }

  startRoomDrag(roomId: string): void { this.draggedRoomId = roomId; }
  dropRoom(targetId: string): void {
    const from = this.draftRooms.findIndex((room) => room.id === this.draggedRoomId);
    const to = this.draftRooms.findIndex((room) => room.id === targetId);
    if (from >= 0 && to >= 0 && from !== to) { const next = [...this.draftRooms]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); this.draftRooms = next; this.saveState = 'idle'; }
    this.draggedRoomId = '';
  }

  startControlDrag(index: number): void { this.draggedControlIndex = index; }
  dropControl(targetIndex: number): void {
    const controls = this.selectedRoom?.controls;
    if (controls && this.draggedControlIndex >= 0 && this.draggedControlIndex !== targetIndex) { const [moved] = controls.splice(this.draggedControlIndex, 1); controls.splice(targetIndex, 0, moved); this.saveState = 'idle'; }
    this.draggedControlIndex = -1;
  }

  updateRoomId(): void {
    const room = this.selectedRoom;
    if (room) {
      room.id = this.slugify(room.name) || room.id;
      this.selectedRoomId = room.id;
    }
    this.saveState = 'idle';
  }

  saveChanges(): void {
    this.save.emit({ rooms: this.draftRooms.map((room) => ({ ...room })), floors: this.draftFloors.map((floor) => ({ ...floor })), settings: { ...this.draftSettings }, deviceDefaultFloorId: this.draftDeviceDefaultFloorId });
    this.saveState = 'saved';
  }

  addFloor(): void {
    let suffix = this.draftFloors.length + 1;
    let id = `etage-${suffix}`;
    while (this.draftFloors.some((floor) => floor.id === id)) id = `etage-${++suffix}`;
    this.draftFloors.push({ id, name: `Étage ${suffix}`, icon: 'stairs' });
    this.saveState = 'idle';
  }

  moveFloor(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.draftFloors.length) return;
    [this.draftFloors[index], this.draftFloors[target]] = [this.draftFloors[target], this.draftFloors[index]];
    this.draftFloors = [...this.draftFloors];
    this.saveState = 'idle';
  }

  removeFloor(index: number): void {
    const floor = this.draftFloors[index];
    if (!floor || this.draftRooms.some((room) => room.floor === floor.id)) return;
    this.draftFloors.splice(index, 1);
    this.draftFloors = [...this.draftFloors];
    this.saveState = 'idle';
  }

  async changePin(): Promise<void> {
    this.pinMessage = '';
    if (!/^\d{4,8}$/.test(this.newPin)) { this.pinMessage = 'Le NIP doit contenir de 4 à 8 chiffres.'; return; }
    if (this.newPin !== this.confirmPin) { this.pinMessage = 'Les deux NIP ne correspondent pas.'; return; }
    this.pinSaving = true;
    try {
      await this.api.changeAdminPin(this.newPin);
      this.newPin = '';
      this.confirmPin = '';
      this.pinMessage = 'NIP mis à jour.';
    } catch (error: any) {
      this.pinMessage = error?.status === 404
        ? 'Le serveur Node utilise encore l’ancienne version. Arrêtez-le complètement, puis relancez npm start.'
        : 'Impossible de modifier le NIP. La session a peut-être expiré.';
    }
    finally { this.pinSaving = false; }
  }

  async openSystem(): Promise<void> {
    this.activeSection = 'system';
    this.systemLoading = true;
    this.systemMessage = '';
    try { [this.systemHealth, this.backups] = await Promise.all([this.api.getSystemHealth(), this.api.getBackups()]); }
    catch { this.systemMessage = 'Impossible de charger l’état du système.'; }
    finally { this.systemLoading = false; }
  }

  async restoreBackup(backup: DashboardBackup): Promise<void> {
    if (!window.confirm(`Restaurer la configuration du ${new Date(backup.createdAt).toLocaleString('fr-CA')}?`)) return;
    try { await this.api.restoreBackup(backup.id); this.systemMessage = 'Sauvegarde restaurée. Rechargez le tableau de bord.'; }
    catch { this.systemMessage = 'La restauration a échoué.'; }
  }

  async openConnection(): Promise<void> { this.activeSection = 'connection'; this.hassStatus = await this.api.getHassStatus(); this.hassUrl = this.hassStatus.url || ''; }
  async saveHassConnection(): Promise<void> {
    this.hassSaving = true; this.hassMessage = '';
    try { this.hassStatus = await this.api.saveHassConfig(this.hassUrl, this.hassToken); this.hassToken = ''; this.hassMessage = 'Connexion validée et enregistrée sur le serveur.'; }
    catch { this.hassMessage = 'Connexion refusée. Vérifiez l’adresse et le nouveau jeton.'; }
    finally { this.hassSaving = false; }
  }

  async openIconPicker(): Promise<void> {
    this.iconPickerOpen = true;
    this.iconLimit = 300;
    if (this.icons.length || this.iconsLoading) return;
    this.iconsLoading = true;
    try { this.icons = await this.api.getIcons(); } finally { this.iconsLoading = false; }
  }

  openRoomIconPicker(): void {
    this.iconPickerControlIndex = -1;
    void this.openIconPicker();
  }

  selectIcon(icon: string): void {
    if (this.selectedRoom && this.iconPickerControlIndex >= 0 && this.selectedRoom.controls?.[this.iconPickerControlIndex]) this.selectedRoom.controls[this.iconPickerControlIndex].icon = icon;
    else if (this.selectedRoom) this.selectedRoom.icon = icon;
    this.iconPickerOpen = false;
    this.iconPickerControlIndex = -1;
    this.iconQuery = '';
    this.saveState = 'idle';
  }

  showMoreIcons(): void {
    this.iconLimit += 300;
  }

  selectPresenceEntity(entityId: string): void {
    const room = this.selectedRoom;
    if (this.entityPickerMode === 'securityCamera' && this.draftSettings.security.cameras[this.entityPickerControlIndex]) this.draftSettings.security.cameras[this.entityPickerControlIndex].entityId = entityId;
    else if (this.entityPickerMode === 'doorbell') this.draftSettings.security.doorbellEntityId = entityId;
    else if (this.entityPickerMode === 'doorbellCamera') this.draftSettings.security.doorbellCameraEntityId = entityId;
    else if (this.entityPickerMode === 'doorLock') this.draftSettings.security.doorLockEntityId = entityId;
    else if (this.entityPickerMode === 'entryLight') this.draftSettings.security.entryLightEntityId = entityId;
    else if (this.entityPickerMode === 'presence') this.draftSettings.screensaverEntityId = entityId;
    else if (room && this.entityPickerMode === 'climate' && room.climate) room.climate.entityId = entityId;
    else if (room && this.entityPickerMode === 'vacuum' && room.vacuum) room.vacuum.entityId = entityId;
    else if (room && this.entityPickerMode === 'control' && room.controls?.[this.entityPickerControlIndex]) room.controls[this.entityPickerControlIndex].entityId = entityId;
    this.entityPickerOpen = false;
    this.entityQuery = '';
    this.saveState = 'idle';
  }

  openEntityPicker(mode: typeof this.entityPickerMode, controlIndex = -1): void {
    this.entityPickerMode = mode;
    this.entityPickerControlIndex = controlIndex;
    this.entityQuery = '';
    this.entityPickerOpen = true;
  }

  openControlIconPicker(index: number): void {
    this.iconPickerControlIndex = index;
    void this.openIconPicker();
  }

  addSecurityCamera(): void { this.draftSettings.security.cameras.push({ entityId: '', name: `Caméra ${this.draftSettings.security.cameras.length + 1}`, zone: 'exterior' }); this.saveState = 'idle'; }
  removeSecurityCamera(index: number): void { this.draftSettings.security.cameras.splice(index, 1); this.saveState = 'idle'; }

  addControl(): void {
    const room = this.selectedRoom;
    if (!room) return;
    room.controls ??= [];
    room.controls.push({ id: `control-${Date.now()}`, label: 'Nouvel élément', entityId: '', icon: 'toggle_on', tapAction: 'toggle', holdAction: 'none', confirm: false });
    this.saveState = 'idle';
  }

  removeControl(index: number): void {
    this.selectedRoom?.controls?.splice(index, 1);
    this.saveState = 'idle';
  }

  enableClimate(enabled: boolean): void {
    if (this.selectedRoom) this.selectedRoom.climate = { enabled, entityId: this.selectedRoom.climate?.entityId || '' };
    this.saveState = 'idle';
  }

  enableVacuum(enabled: boolean): void {
    if (this.selectedRoom) this.selectedRoom.vacuum = { enabled, entityId: this.selectedRoom.vacuum?.entityId || '', roomParameter: this.selectedRoom.vacuum?.roomParameter || '' };
    this.saveState = 'idle';
  }

  toggleFavorite(icon: string, event: Event): void {
    event.stopPropagation();
    this.favoriteIcons = this.favoriteIcons.includes(icon) ? this.favoriteIcons.filter((item) => item !== icon) : [icon, ...this.favoriteIcons];
    localStorage.setItem('dashboard-favorite-icons', JSON.stringify(this.favoriteIcons));
  }

  trackRoom(_: number, room: AdminRoom): string {
    return room.id;
  }

  private slugify(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  }
}
