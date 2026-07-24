import { describe, expect, it } from 'vitest';

import { layoutDayColumn } from './layout';

describe('layoutDayColumn', () => {
  it('gives non-overlapping events full width', () => {
    const out = layoutDayColumn([
      { startMin: 540, endMin: 600 }, // 09:00–10:00
      { startMin: 600, endMin: 660 }, // 10:00–11:00
    ]);
    expect(out).toEqual([
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
    ]);
  });

  it('splits two overlapping events into two lanes', () => {
    const out = layoutDayColumn([
      { startMin: 540, endMin: 660 },
      { startMin: 600, endMin: 720 },
    ]);
    expect(out[0]).toEqual({ lane: 0, laneCount: 2 });
    expect(out[1]).toEqual({ lane: 1, laneCount: 2 });
  });

  it('reuses a freed lane inside a cluster and sizes the whole cluster', () => {
    const out = layoutDayColumn([
      { startMin: 540, endMin: 720 }, // long spine
      { startMin: 540, endMin: 600 }, // beside it
      { startMin: 630, endMin: 690 }, // fits back into the freed lane
    ]);
    expect(out[0]).toEqual({ lane: 0, laneCount: 2 });
    expect(out[1]).toEqual({ lane: 1, laneCount: 2 });
    expect(out[2]).toEqual({ lane: 1, laneCount: 2 });
  });

  it('keeps results indexed by input order regardless of sort order', () => {
    const out = layoutDayColumn([
      { startMin: 600, endMin: 720 },
      { startMin: 540, endMin: 660 },
    ]);
    expect(out[0].lane).toBe(1); // later start sorts second → second lane
    expect(out[1].lane).toBe(0);
  });

  it('treats zero-length events as tappable minimum-height boxes', () => {
    const out = layoutDayColumn([
      { startMin: 540, endMin: 540 },
      { startMin: 545, endMin: 605 }, // overlaps the padded box
    ]);
    expect(out[0].laneCount).toBe(2);
    expect(out[1].laneCount).toBe(2);
  });
});
