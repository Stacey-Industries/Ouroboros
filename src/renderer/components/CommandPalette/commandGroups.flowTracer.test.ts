// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowTracerCommands } from './commandGroups.flowTracer';

describe('flowTracerCommands', () => {
  let dispatched: CustomEvent[];

  beforeEach(() => {
    dispatched = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push(e as CustomEvent);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns two commands', () => {
    expect(flowTracerCommands()).toHaveLength(2);
  });

  it('browse-flows command has correct id and label', () => {
    const cmd = flowTracerCommands().find((c) => c.id === 'flow-tracer:browse-flows');
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe('Flow Tracer: Browse Flows');
    expect(cmd?.category).toBe('view');
  });

  it('search command has correct id and label', () => {
    const cmd = flowTracerCommands().find((c) => c.id === 'flow-tracer:search');
    expect(cmd).toBeDefined();
    expect(cmd?.label).toBe('Flow Tracer: Search');
    expect(cmd?.category).toBe('view');
  });

  it('browse-flows dispatches OPEN_FLOW_TRACER_EVENT', () => {
    const cmd = flowTracerCommands().find((c) => c.id === 'flow-tracer:browse-flows');
    cmd?.action?.();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('agent-ide:open-flow-tracer');
  });

  it('search dispatches OPEN_FLOW_TRACER_EVENT', () => {
    const cmd = flowTracerCommands().find((c) => c.id === 'flow-tracer:search');
    cmd?.action?.();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('agent-ide:open-flow-tracer');
  });
});
