/**
 * Dock Persistence Schema Fragment — electron-store shape for terminal dock height
 *
 * Phase 0 scaffolding: defines the shape and defaults for terminal dock height persistence.
 * Phase 3 will register this fragment with the main electron-store schema and migrate
 * existing localStorage values into the persistent store.
 */

export interface DockPersistenceSchemaFragment {
  dockHeight: {
    type: 'number';
    default: number;
    minimum: number;
    maximum: number;
  };
}

export const DOCK_PERSISTENCE_DEFAULTS = {
  dockHeight: 240,
} as const;

export const DOCK_HEIGHT_BOUNDS = {
  min: 120,
  max: 720,
} as const;

export const dockPersistenceSchemaFragment: DockPersistenceSchemaFragment = {
  dockHeight: {
    type: 'number',
    default: DOCK_PERSISTENCE_DEFAULTS.dockHeight,
    minimum: DOCK_HEIGHT_BOUNDS.min,
    maximum: DOCK_HEIGHT_BOUNDS.max,
  },
};
