import { describe, expect, it } from 'vitest';
import { LocalEventService } from './local-event.service.js';

describe('LocalEventService', () => {
  it('uses a fixed mock date when date is omitted', async () => {
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({ region: '오산' });

    expect(result.summary).toContain('2026-06-13');
    expect(result.events[0].date).toBe('2026-06-13');
    expect(result.source).toBe('mock');
  });
});
