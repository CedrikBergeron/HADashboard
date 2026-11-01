import { fakeAsync, tick } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardApiService } from './dashboard-api.service';

describe('Administrator PIN verification timeout', () => {
  it('cancels a stalled request after 15 seconds', fakeAsync(() => {
    let cancelled = false;
    const http = { post: () => new Observable(() => () => { cancelled = true; }) };
    const api = new DashboardApiService(http as unknown as HttpClient);
    let failure: { name: string } | undefined;
    void api.unlock('1234').catch((error) => failure = error);
    tick(14999);
    expect(failure).toBeUndefined();
    tick(1);
    expect(failure?.name).toBe('TimeoutError');
    expect(cancelled).toBeTrue();
  }));
});
