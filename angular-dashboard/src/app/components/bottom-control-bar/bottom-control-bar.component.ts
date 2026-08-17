import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  NgZone
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';

export interface BottomControlItem {
  id: string;
  name: string;
  icon: string;
  value?: string | number | null;
  clickable?: boolean;
  hasSlider?: boolean;
  sliderValue?: number;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  active?: boolean;
  lastSliderValue?: number;
}

@Component({
  selector: 'app-bottom-control-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bottom-control-bar.component.html',
  styleUrl: './bottom-control-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BottomControlBarComponent {
  private _items: BottomControlItem[] = [];
  private holdTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private suppressClickId = '';

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone
  ) {}

  @Input()
  set items(value: BottomControlItem[]) {
    this._items = (value || []).map((item) => {
      // If slider value is not 0 on init, mark active, save last value
      const sliderValue = item.sliderValue ?? 0;
      const numericValue = typeof item.value === 'number' ? item.value : 0;

      if (item.hasSlider) {
        if (sliderValue !== 0) {
          item.active = true;
          item.lastSliderValue = sliderValue;
        } else {
          item.active = false;
        }
      } else if (numericValue !== 0) {
        item.active = true;
      }

      return item;
    });
  }

  get items(): BottomControlItem[] {
    return this._items;
  }

  @Output() itemClick = new EventEmitter<BottomControlItem>();
  @Output() itemLongPress = new EventEmitter<BottomControlItem>();
  @Output() sliderChange = new EventEmitter<{
    item: BottomControlItem;
    value: number;
  }>();

  onItemClick(item: BottomControlItem): void {
    if (this.suppressClickId === item.id) { this.suppressClickId = ''; return; }
    if (item.clickable === false) return;

    if (item.hasSlider) {
      const currentValue = item.sliderValue ?? 0;
      if (item.active) {
        // going off: save current slider value and animate down to 0
        item.lastSliderValue = currentValue;
        if (currentValue > 0) {
          this.animateSlider(item, currentValue, 0, 250);
        } else {
          item.sliderValue = 0;
        }
      } else {
        // going on: restore with animation from 0 to last value
        const target = item.lastSliderValue ?? currentValue ?? 0;
        item.sliderValue = 0;
        if (target > 0) {
          this.animateSlider(item, 0, target, 250);
        } else {
          item.sliderValue = target;
        }
      }
    }

    item.active = !item.active;
    this.itemClick.emit(item);
  }

  startLongPress(item: BottomControlItem): void {
    this.cancelLongPress();
    this.holdTimeoutId = setTimeout(() => { this.holdTimeoutId = null; this.suppressClickId = item.id; this.itemLongPress.emit(item); }, 650);
  }

  cancelLongPress(): void { if (this.holdTimeoutId) clearTimeout(this.holdTimeoutId); this.holdTimeoutId = null; }

  onSliderInput(item: BottomControlItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    item.sliderValue = value;

    if (item.hasSlider) {
      if (value === 0) {
        item.active = false;
      } else {
        item.active = true;
        item.lastSliderValue = value;
      }
    }

    this.sliderChange.emit({
      item,
      value
    });
  }

  private animateSlider(item: BottomControlItem, from: number, to: number, duration = 250): void {
    const start = performance.now();
    const delta = to - from;

    const animationStep = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      item.sliderValue = Math.round(from + delta * progress);
      this.cdr.markForCheck();

      if (progress < 1) {
        requestAnimationFrame(animationStep);
      } else {
        item.sliderValue = to;
        this.cdr.markForCheck();
      }
    };

    requestAnimationFrame(animationStep);
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  getDisplayValue(item: BottomControlItem): string {
    if (item.hasSlider) {
      return `${Math.round(item.sliderValue ?? 0)}%`;
    }

    if (item.value === null || item.value === undefined || item.value === '') {
      return '';
    }

    return String(item.value);
  }
}
