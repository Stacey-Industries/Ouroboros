// @vitest-environment jsdom
/**
 * webPreloadOverlay.test.ts — Wave 34 Phase G.
 *
 * Covers:
 *  - showConnectionOverlay creates the banner on first call
 *  - showConnectionOverlay updates text on subsequent calls
 *  - hideConnectionOverlay removes the banner
 *  - hideConnectionOverlay is a no-op when no banner exists
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hideConnectionOverlay, showConnectionOverlay } from './webPreloadOverlay';

const OVERLAY_ID = 'ws-connection-overlay';

beforeEach(() => {
  document.getElementById(OVERLAY_ID)?.remove();
});

afterEach(() => {
  document.getElementById(OVERLAY_ID)?.remove();
});

describe('showConnectionOverlay', () => {
  it('creates the overlay element when absent', () => {
    showConnectionOverlay('Disconnected');
    expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
  });

  it('sets the overlay text content', () => {
    showConnectionOverlay('Reconnecting...');
    expect(document.getElementById(OVERLAY_ID)?.textContent).toBe('Reconnecting...');
  });

  it('updates text on repeated calls without duplicating the element', () => {
    showConnectionOverlay('First');
    showConnectionOverlay('Second');
    expect(document.getElementById(OVERLAY_ID)?.textContent).toBe('Second');
    expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveLength(1);
  });
});

describe('hideConnectionOverlay', () => {
  it('removes an existing overlay', () => {
    showConnectionOverlay('shown');
    hideConnectionOverlay();
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });

  it('is a no-op when no overlay exists', () => {
    expect(() => hideConnectionOverlay()).not.toThrow();
  });
});
