import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { NavItem } from '../../models/NavItem';

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

  @ViewChild('roomDialog', { static: true }) roomDialog!: ElementRef<HTMLDialogElement>;
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

  openRoomMenu(): void {
    if (this.floorChangePending || this.roomMenuOpen) return;
    this.roomDialog.nativeElement.showModal();
    this.roomMenuOpen = true;
    const selected = this.roomDialog.nativeElement.querySelector<HTMLButtonElement>('.room-card.is-selected');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  }

  closeRoomMenu(): void {
    this.roomDialog.nativeElement.close();
    this.roomMenuOpen = false;
  }

  onRoomBackdropClick(event: MouseEvent): void {
    if (event.target === this.roomDialog.nativeElement) this.closeRoomMenu();
  }

  cancelRoomMenu(event: Event): void {
    event.preventDefault();
    this.closeRoomMenu();
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
      this.clockLongPress.emit();
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
