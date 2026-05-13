import { describe, expect, it } from 'vitest';

import {
  DOCK_HEIGHT_BOUNDS,
  DOCK_PERSISTENCE_DEFAULTS,
  type DockPersistenceSchemaFragment,
  dockPersistenceSchemaFragment,
} from './dockPersistenceSchema';

describe('dockPersistenceSchema', () => {
  it('has bounds where min < max', () => {
    expect(DOCK_HEIGHT_BOUNDS.min).toBeLessThan(DOCK_HEIGHT_BOUNDS.max);
  });

  it('has a default within bounds', () => {
    expect(DOCK_PERSISTENCE_DEFAULTS.dockHeight).toBeGreaterThanOrEqual(DOCK_HEIGHT_BOUNDS.min);
    expect(DOCK_PERSISTENCE_DEFAULTS.dockHeight).toBeLessThanOrEqual(DOCK_HEIGHT_BOUNDS.max);
  });

  it('exposes a schema fragment matching the electron-store JSON schema shape', () => {
    expect(dockPersistenceSchemaFragment.dockHeight.type).toBe('number');
    expect(dockPersistenceSchemaFragment.dockHeight.default).toBe(DOCK_PERSISTENCE_DEFAULTS.dockHeight);
    expect(dockPersistenceSchemaFragment.dockHeight.minimum).toBe(DOCK_HEIGHT_BOUNDS.min);
    expect(dockPersistenceSchemaFragment.dockHeight.maximum).toBe(DOCK_HEIGHT_BOUNDS.max);
  });

  it('exports the DockPersistenceSchemaFragment type usably', () => {
    const sample: DockPersistenceSchemaFragment = {
      dockHeight: {
        type: 'number',
        default: 240,
        minimum: 100,
        maximum: 800,
      },
    };
    expect(sample.dockHeight.type).toBe('number');
  });
});
