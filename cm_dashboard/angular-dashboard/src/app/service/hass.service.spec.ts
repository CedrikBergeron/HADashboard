import { TestBed } from '@angular/core/testing';

import { HassService } from './hass.service';

describe('HassService', () => {
  let service: HassService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HassService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
