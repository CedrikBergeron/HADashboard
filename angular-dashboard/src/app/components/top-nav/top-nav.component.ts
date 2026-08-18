import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NavItem } from '../../models/NavItem';

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
export class TopNavComponent {
  private clockLongPressTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _items: NavItem[] = [];
  private pendingFloor: string | null = null;

  @Input()
  set items(value: NavItem[]) {
    this._items = value ?? [];
    const activeItem = this._items.find((item) => item.active);
    if (activeItem?.floor && (!this.pendingFloor || activeItem.floor === this.pendingFloor)) {
      this.currentFloor = activeItem.floor;
      this.pendingFloor = null;
    } else if (!activeItem && !this.pendingFloor) {
      this.currentFloor = this._defaultFloor;
    }
  }

  get items(): NavItem[] {
    return this._items;
  }

  @Input() time = '';
  @Input() floors: Array<{ id: string; name: string; icon: string }> = [];
  private _defaultFloor = 'main';
  @Input()
  set defaultFloor(value: string) {
    this._defaultFloor = value || 'main';
    if (!this.items.some((item) => item.active)) this.currentFloor = this._defaultFloor;
  }
  @Input() actionChip: TopNavActionChip | null = null;
  @Output() itemClick = new EventEmitter<NavItem>();
  @Output() actionChipClick = new EventEmitter<void>();
  @Output() clockLongPress = new EventEmitter<void>();

  currentFloor = 'main';
  floorAnimationAlternate = false;

  get visibleItems(): NavItem[] {
    return this.items.filter((item) => item.floor === this.currentFloor);
  }

  toggleFloor(): void {
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

    this.pendingFloor = targetFloor;
    this.currentFloor = targetFloor;
    this.floorAnimationAlternate = !this.floorAnimationAlternate;
    this.onItemClick(targetItem);
  }

  ngOnInit(): void {
  }

  onItemClick(item: NavItem): void {
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
