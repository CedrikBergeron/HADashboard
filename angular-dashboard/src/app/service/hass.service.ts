import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';

export interface HassStateChangedEvent {
  entity_id: string;
  new_state?: HassEntityState | null;
  old_state?: HassEntityState | null;
}

export interface HassAreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
}

export interface HassDeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name_by_user?: string | null;
  name?: string | null;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  original_name?: string | null;
  name?: string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
}

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export type HassServiceCatalog = Record<string, Record<string, unknown>>;

interface HassEvent {
  event_type: string;
  data: HassStateChangedEvent;
}

interface HassMessage {
  type: string;
  id?: number;
  event?: HassEvent;
  success?: boolean;
  result?: any;
  error?: any;
}

interface HassPendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

@Injectable({
  providedIn: 'root'
})
export class HassService {
  private ws: WebSocket | null = null;
  private readonly entitiesSubject = new BehaviorSubject<Record<string, HassEntityState>>({});
  private readonly areasSubject = new BehaviorSubject<HassAreaRegistryEntry[]>([]);
  private readonly devicesSubject = new BehaviorSubject<HassDeviceRegistryEntry[]>([]);
  private readonly entityRegistrySubject = new BehaviorSubject<HassEntityRegistryEntry[]>([]);
  private readonly servicesSubject = new BehaviorSubject<HassServiceCatalog>({});
  private readonly connectedSubject = new BehaviorSubject<boolean>(false);

  readonly entities$ = this.entitiesSubject.asObservable();
  readonly areas$ = this.areasSubject.asObservable();
  readonly devices$ = this.devicesSubject.asObservable();
  readonly entityRegistry$ = this.entityRegistrySubject.asObservable();
  readonly services$ = this.servicesSubject.asObservable();
  readonly connected$ = this.connectedSubject.asObservable();

  private readonly pendingRequests = new Map<number, HassPendingRequest>();
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;

  private readonly hassUrl = location.port === '4200'
    ? 'ws://localhost:3000/api/home-assistant/websocket'
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/home-assistant/websocket`;
  private readonly accessToken = 'server-proxy';

  constructor(private readonly ngZone: NgZone) {
    this.connect();
  }

  getEntity(entityId: string): Observable<HassEntityState | undefined> {
    return this.entities$.pipe(map((entities) => entities[entityId]));
  }

  getSnapshot(): Record<string, HassEntityState> {
    return this.entitiesSubject.value;
  }

  patchEntityState(
    entityId: string,
    nextState: Partial<Omit<HassEntityState, 'attributes' | 'entity_id'>>,
    attributePatch?: Record<string, any>
  ): void {
    const currentState = this.entitiesSubject.value[entityId];
    if (!currentState) {
      return;
    }

    const updatedState: HassEntityState = {
      ...currentState,
      ...nextState,
      attributes: {
        ...currentState.attributes,
        ...(attributePatch ?? {})
      }
    };

    this.entitiesSubject.next({
      ...this.entitiesSubject.value,
      [entityId]: updatedState
    });
  }

  async callService(
    domain: string,
    service: string,
    entityId: string,
    serviceData?: Record<string, any>,
    options?: {
      deviceId?: string;
      useTarget?: boolean;
    }
  ): Promise<void> {
    const payload: Record<string, any> = {
      type: 'call_service',
      domain,
      service
    };

    if (options?.deviceId || options?.useTarget) {
      payload['target'] = {
        entity_id: [entityId],
        ...(options?.deviceId ? { device_id: [options.deviceId] } : {})
      };
      payload['service_data'] = serviceData ?? {};
    } else {
      payload['service_data'] = {
        entity_id: entityId,
        ...(serviceData ?? {})
      };
    }

    await this.sendCommand({
      ...payload
    });
  }

  private connect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.ws = new WebSocket(this.hassUrl);

    this.ws.onmessage = (event) => {
      this.ngZone.run(() => {
        const message: HassMessage = JSON.parse(event.data);
        this.handleMessage(message);
      });
    };

    this.ws.onclose = () => {
      this.ngZone.run(() => {
        this.connectedSubject.next(false);
        this.rejectPendingRequests(new Error('WebSocket connection closed.'));
        this.scheduleReconnect();
      });
    };

    this.ws.onerror = () => {
      this.ngZone.run(() => {
        this.connectedSubject.next(false);
      });
    };
  }

  private handleMessage(message: HassMessage): void {
    switch (message.type) {
      case 'auth_required':
        this.authenticate();
        break;
      case 'auth_ok':
        this.connectedSubject.next(true);
        void this.bootstrap();
        break;
      case 'auth_invalid':
        this.connectedSubject.next(false);
        this.rejectPendingRequests(message.error ?? new Error('Home Assistant authentication failed.'));
        break;
      case 'result':
        this.resolvePendingRequest(message);
        break;
      case 'event':
        if (message.event?.event_type === 'state_changed') {
          this.applyStateChange(message.event.data);
        }
        break;
      default:
        break;
    }
  }

  private authenticate(): void {
    if (!this.ws) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'auth',
        access_token: this.accessToken
      })
    );
  }

  private async bootstrap(): Promise<void> {
    try {
      const [areas, devices, entityRegistry, states, services] = await Promise.all([
        this.sendCommand<HassAreaRegistryEntry[]>({ type: 'config/area_registry/list' }),
        this.sendCommand<HassDeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
        this.sendCommand<HassEntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
        this.sendCommand<HassEntityState[]>({ type: 'get_states' }),
        this.sendCommand<HassServiceCatalog>({ type: 'get_services' })
      ]);

      this.areasSubject.next(areas);
      this.devicesSubject.next(devices);
      this.entityRegistrySubject.next(entityRegistry);
      this.entitiesSubject.next(
        states.reduce<Record<string, HassEntityState>>((accumulator, state) => {
          accumulator[state.entity_id] = state;
          return accumulator;
        }, {})
      );
      this.servicesSubject.next(services);

      await this.sendCommand({
        type: 'subscribe_events',
        event_type: 'state_changed'
      });
    } catch (error) {
      console.error('Failed to bootstrap Home Assistant data.', error);
    }
  }

  private applyStateChange(event: HassStateChangedEvent): void {
    const entityId = event.entity_id;
    if (!entityId) {
      return;
    }

    const nextEntities = { ...this.entitiesSubject.value };

    if (event.new_state) {
      nextEntities[entityId] = event.new_state;
    } else {
      delete nextEntities[entityId];
    }

    this.entitiesSubject.next(nextEntities);
  }

  private sendCommand<T>(payload: Record<string, any>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Home Assistant WebSocket is not connected.'));
        return;
      }

      const id = this.nextId++;
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
      this.ws.send(
        JSON.stringify({
          id,
          ...payload
        })
      );
    });
  }

  private resolvePendingRequest(message: HassMessage): void {
    if (!message.id) {
      return;
    }

    const pendingRequest = this.pendingRequests.get(message.id);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.success) {
      pendingRequest.resolve(message.result);
      return;
    }

    pendingRequest.reject(message.error ?? new Error('Home Assistant command failed.'));
  }

  private rejectPendingRequests(reason: unknown): void {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      pendingRequest.reject(reason);
      this.pendingRequests.delete(requestId);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      return;
    }

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, 5000);
  }
}
