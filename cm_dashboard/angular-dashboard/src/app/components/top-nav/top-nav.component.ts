import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { NavItem } from '../../models/NavItem';

export interface CameraMenuItem {
  entityId: string;
  name: string;
  streamUrl: string;
  fullscreenStreamUrl?: string;
  fullscreenAvailable?: boolean;
  available: boolean;
}

export interface RoomMenuBackground {
  roomValue: string;
  src: string;
  positionX: number;
  positionY: number;
}

export interface TopNavActionChip {
  label: string;
  active?: boolean;
}

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-nav.component.html',
  styleUrl: './top-nav.component.scss'
})
export class TopNavComponent implements OnDestroy {
  private clockLongPressTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private floorTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private floorSwapTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _items: NavItem[] = [];
  private pendingFloor: string | null = null;

  @Input()
  set items(value: NavItem[]) {
    this._items = value ?? [];
    if (this.pendingFloor) return;
    const activeItem = this._items.find((item) => item.active);
    if (activeItem?.floor) {
      this.currentFloor = activeItem.floor;
    } else if (!activeItem) {
      this.currentFloor = this._defaultFloor;
    }
  }

  get items(): NavItem[] {
    return this._items;
  }

  @ViewChild('roomDialog', { static: true }) roomDialog!: ElementRef<HTMLElement>;
  @ViewChild('roomTrigger', { static: true }) roomTrigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('topBar', { static: true }) topBar!: ElementRef<HTMLElement>;
  @ViewChild('cameraDialog', { static: true }) cameraDialog!: ElementRef<HTMLElement>;
  @ViewChild('cameraTrigger', { static: true }) cameraTrigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('cameraFullscreen', { static: true }) cameraFullscreen!: ElementRef<HTMLDialogElement>;
  private _cameras: CameraMenuItem[] = [];
  @Input() set cameras(value: CameraMenuItem[]) {
    this._cameras = value || [];
    this.cameraPage = Math.min(this.cameraPage, this.cameraPageCount - 1);
    this.stopRemovedCameraImages();
  }
  get cameras(): CameraMenuItem[] { return this._cameras; }
  cameraPage = 0;
  cameraPageSize = window.innerWidth >= 768 ? 9 : 4;
  fullscreenCamera: CameraMenuItem | null = null;
  fullscreenStreamFailed = false;
  fullscreenRetryNonce = 0;
  private destroyed = false;
  private _mediaSuspended = false;
  private suppressFullscreenReturn = false;
  @Input() set mediaSuspended(value: boolean) {
    this._mediaSuspended = value;
    if (value) this.suspendCameraViewing();
  }

  private suspendCameraViewing(): void {
    if (this.cameraFullscreen?.nativeElement.open) {
      this.suppressFullscreenReturn = true;
      this.closeCameraFullscreen();
    }
    if (this.cameraDialog) this.closeCameraMenu();
    if (this.roomDialog) this.closeRoomMenu();
  }

  requestAdminAccess(): void {
    // Release long-lived camera requests before the PIN request is issued.
    this.suspendCameraViewing();
    this.clockLongPress.emit();
  }
  cameraMenuOpen = false;
  readonly failedCameraStreams = new Set<string>();
  readonly cameraRetryNonce: Record<string, number> = {};
  roomMenuTop = 104;
  @Input() roomBackgrounds: RoomMenuBackground[] = [];
  roomMenuOpen = false;
  private readonly failedImages = new Set<string>();

  @Input() time = '';
  @Input() floors: Array<{ id: string; name: string; icon: string }> = [];
  private _defaultFloor = 'main';
  @Input()
  set defaultFloor(value: string) {
    this._defaultFloor = value || 'main';
    if (!this.items.some((item) => item.active)) this.currentFloor = this._defaultFloor;
  }
  @Input() actionChip: TopNavActionChip | null = null;
  @Input() securityAvailable = false;
  @Input() securityActive = false;
  @Output() itemClick = new EventEmitter<NavItem>();
  @Output() actionChipClick = new EventEmitter<void>();
  @Output() securityClick = new EventEmitter<void>();
  @Output() clockLongPress = new EventEmitter<void>();

  currentFloor = 'main';
  floorAnimationAlternate = false;
  floorMenuTransition: 'idle' | 'leaving' | 'entering' = 'idle';

  get visibleItems(): NavItem[] {
    return this.items.filter((item) => item.floor === this.currentFloor);
  }

  get selectedItem(): NavItem | undefined {
    return this.visibleItems.find((item) => item.active);
  }

  roomBackground(item: NavItem): RoomMenuBackground | undefined {
    return this.roomBackgrounds.find((background) => background.roomValue === item.value && !this.failedImages.has(background.src));
  }

  imageFailed(src: string): void { this.failedImages.add(src); }

  closeRoomMenu(): void {
    const menu = this.roomDialog.nativeElement;
    const restoreFocus = menu.contains(document.activeElement);
    if (menu.matches(':popover-open')) menu.hidePopover();
    this.roomMenuOpen = false;
    if (restoreFocus) this.roomTrigger.nativeElement.focus({ preventScroll: true });
  }

  onRoomMenuToggle(event: Event): void {
    const opening = (event as ToggleEvent).newState === 'open';
    if (opening && (this.floorChangePending || !this.visibleItems.length)) {
      event.preventDefault();
      return;
    }
    if (opening) this.roomMenuTop = Math.ceil(this.topBar.nativeElement.getBoundingClientRect().bottom + 16);
    this.roomMenuOpen = opening;
  }

  onRoomMenuAfterToggle(): void {
    if (!this.roomDialog.nativeElement.matches(':popover-open')) return;
    const selected = this.roomDialog.nativeElement.querySelector<HTMLButtonElement>('.room-card.is-selected');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  }

  onCameraMenuToggle(event: Event): void {
    const opening = (event as ToggleEvent).newState === 'open';
    if (opening && this._mediaSuspended) { event.preventDefault(); return; }
    if (opening) {
      this.roomMenuTop = Math.ceil(this.topBar.nativeElement.getBoundingClientRect().bottom + 16);
      this.failedCameraStreams.clear();
      this.closeRoomMenu();
    }
    if (!opening) this.stopCameraImages(this.cameraDialog.nativeElement);
    this.cameraMenuOpen = opening;
  }

  private stopCameraImages(container: HTMLElement | undefined): void {
    // Removing an MJPEG <img> from the DOM alone can leave its connection running.
    container?.querySelectorAll<HTMLImageElement>('img').forEach((image) => image.removeAttribute('src'));
  }

  private stopRemovedCameraImages(): void {
    const retained = new Set(this.pagedCameras.map((camera) => camera.entityId));
    this.cameraDialog?.nativeElement.querySelectorAll<HTMLImageElement>('.camera-visual img').forEach((image) => {
      const id = image.closest('.camera-tile')?.getAttribute('data-camera-id');
      if (!id || !retained.has(id)) image.removeAttribute('src');
    });
  }

  closeCameraMenu(): void {
    const menu = this.cameraDialog.nativeElement;
    this.stopCameraImages(menu);
    const restoreFocus = menu.contains(document.activeElement);
    if (menu.matches(':popover-open')) menu.hidePopover();
    this.cameraMenuOpen = false;
    if (restoreFocus) this.cameraTrigger.nativeElement.focus({ preventScroll: true });
  }

  get cameraPageCount(): number { return Math.max(1, Math.ceil(this.cameras.length / this.cameraPageSize)); }
  get pagedCameras(): CameraMenuItem[] { return this.cameras.slice(this.cameraPage * this.cameraPageSize, (this.cameraPage + 1) * this.cameraPageSize); }

  changeCameraPage(direction: -1 | 1): void {
    this.cameraPage = Math.max(0, Math.min(this.cameraPageCount - 1, this.cameraPage + direction));
    this.stopRemovedCameraImages();
  }

  @HostListener('window:resize')
  updateCameraPageSize(): void {
    this.cameraPageSize = window.innerWidth >= 768 ? 9 : 4;
    this.cameraPage = Math.min(this.cameraPage, this.cameraPageCount - 1);
    this.stopRemovedCameraImages();
  }

  openCameraFullscreen(camera: CameraMenuItem): void {
    if (this._mediaSuspended) return;
    this.fullscreenCamera = camera;
    this.fullscreenStreamFailed = false;
    this.fullscreenRetryNonce = 0;
    this.closeCameraMenu();
    this.cameraFullscreen.nativeElement.showModal();
  }

  closeCameraFullscreen(): void {
    this.stopCameraImages(this.cameraFullscreen.nativeElement);
    if (this.cameraFullscreen.nativeElement.open) this.cameraFullscreen.nativeElement.close();
  }

  onCameraFullscreenClosed(): void {
    if (!this.fullscreenCamera) return;
    this.stopCameraImages(this.cameraFullscreen.nativeElement);
    const entityId = this.fullscreenCamera?.entityId;
    this.fullscreenCamera = null;
    this.fullscreenStreamFailed = false;
    if (this.destroyed || this._mediaSuspended || this.suppressFullscreenReturn) {
      this.suppressFullscreenReturn = false;
      return;
    }
    this.cameraDialog.nativeElement.showPopover();
    const tile = Array.from(this.cameraDialog.nativeElement.querySelectorAll<HTMLButtonElement>('.camera-expand')).find((button) => button.dataset['cameraId'] === entityId);
    tile?.focus({ preventScroll: true });
  }

  cancelCameraFullscreen(event: Event): void {
    event.preventDefault();
    this.closeCameraFullscreen();
  }

  retryFullscreenStream(): void {
    this.fullscreenStreamFailed = false;
    this.fullscreenRetryNonce++;
  }

  retryCamera(entityId: string): void {
    this.failedCameraStreams.delete(entityId);
    this.cameraRetryNonce[entityId] = (this.cameraRetryNonce[entityId] || 0) + 1;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onRoomMenuEscape(event: Event): void {
    if (this.cameraFullscreen.nativeElement.open) { event.preventDefault(); this.closeCameraFullscreen(); return; }
    if (!this.roomMenuOpen && !this.cameraMenuOpen) return;
    event.preventDefault();
    this.closeRoomMenu();
    this.closeCameraMenu();
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (!(event.target instanceof Node)) return;
    if (this.cameraMenuOpen && !this.cameraDialog.nativeElement.contains(event.target) && !this.cameraTrigger.nativeElement.contains(event.target)) this.closeCameraMenu();
    if (!this.roomMenuOpen) return;
    if (!this.roomDialog.nativeElement.contains(event.target) && !this.roomTrigger.nativeElement.contains(event.target)) this.closeRoomMenu();
  }

  get floorChangePending(): boolean {
    return this.pendingFloor !== null;
  }

  toggleFloor(): void {
    if (this.pendingFloor) return;
    const available = this.floors.filter((floor) => this.items.some((item) => item.floor === floor.id));
    if (available.length < 2) return;
    const index = available.findIndex((floor) => floor.id === this.currentFloor);
    this.selectFloor(available[(index + 1) % available.length].id);
  }

  selectFloor(targetFloor: string): void {
    if (targetFloor === this.currentFloor) {
      return;
    }

    const targetItem = this.getFirstItemForFloor(targetFloor);
    if (!targetItem) {
      return;
    }

    this.closeRoomMenu();
    this.pendingFloor = targetFloor;
    this.floorMenuTransition = 'leaving';

    if (this.floorTransitionTimeoutId) clearTimeout(this.floorTransitionTimeoutId);
    if (this.floorSwapTimeoutId) clearTimeout(this.floorSwapTimeoutId);
    this.floorSwapTimeoutId = setTimeout(() => {
      this.currentFloor = targetFloor;
      this.floorAnimationAlternate = !this.floorAnimationAlternate;
      this.floorMenuTransition = 'entering';
      this.onItemClick(targetItem);
      this.floorSwapTimeoutId = null;
      this.floorTransitionTimeoutId = setTimeout(() => {
        this.pendingFloor = null;
        this.floorMenuTransition = 'idle';
        this.floorTransitionTimeoutId = null;
      }, 360);
    }, 170);
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopCameraImages(this.cameraDialog?.nativeElement);
    this.stopCameraImages(this.cameraFullscreen?.nativeElement);
    this.cancelClockLongPress();
    if (this.floorTransitionTimeoutId) clearTimeout(this.floorTransitionTimeoutId);
    if (this.floorSwapTimeoutId) clearTimeout(this.floorSwapTimeoutId);
  }

  onItemClick(item: NavItem): void {
    this.closeRoomMenu();
    this.itemClick.emit(item);
  }

  onActionChipClick(): void {
    this.actionChipClick.emit();
  }

  startClockLongPress(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.cancelClockLongPress();
    this.clockPressActive = true;
    this.clockLongPressTimeoutId = setTimeout(() => {
      this.clockLongPressTimeoutId = null;
      this.clockPressActive = false;
      this.requestAdminAccess();
    }, 1500);
  }

  cancelClockLongPress(): void {
    if (this.clockLongPressTimeoutId) clearTimeout(this.clockLongPressTimeoutId);
    this.clockLongPressTimeoutId = null;
    this.clockPressActive = false;
  }

  clockPressActive = false;

  get currentFloorLabel(): string {
    return this.floors.find((floor) => floor.id === this.currentFloor)?.name ?? this.currentFloor;
  }

  get currentFloorArrow(): string {
    return 'unfold_more';
  }

  private getFirstItemForFloor(floor: string): NavItem | undefined {
    const preferredValues = floor === 'main'
      ? ['entree', 'accueil']
      : ['passage'];

    for (const value of preferredValues) {
      const preferredItem = this.items.find((item) => item.floor === floor && item.value === value);
      if (preferredItem) {
        return preferredItem;
      }
    }

    return this.items.find((item) => item.floor === floor);
  }
}
