import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bootstrap', () => {
  beforeEach(async () => {
    delete process.env['UV_THREADPOOL_SIZE'];
    vi.resetModules();
  });

  it('sets UV_THREADPOOL_SIZE to a numeric string', async () => {
    await import('./bootstrap');
    const value = process.env['UV_THREADPOOL_SIZE'];
    expect(value).toBeDefined();
    expect(Number.isInteger(Number(value))).toBe(true);
  });

  it('sets UV_THREADPOOL_SIZE to a value >= 4', async () => {
    await import('./bootstrap');
    const value = Number(process.env['UV_THREADPOOL_SIZE']);
    expect(value).toBeGreaterThanOrEqual(4);
  });

  it('does not overwrite a user-supplied UV_THREADPOOL_SIZE', async () => {
    process.env['UV_THREADPOOL_SIZE'] = '8';
    await import('./bootstrap');
    expect(process.env['UV_THREADPOOL_SIZE']).toBe('8');
  });
});
