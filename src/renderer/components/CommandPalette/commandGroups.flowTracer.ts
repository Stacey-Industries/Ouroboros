import { OPEN_FLOW_TRACER_EVENT } from '../../hooks/appEventNames';
import type { Command } from './types';

function dispatchIdeEvent(eventName: string): void {
  window.dispatchEvent(new CustomEvent(eventName));
}

/** Flow Tracer commands (flat). Phase 1: both dispatch OPEN_FLOW_TRACER_EVENT. */
export function flowTracerCommands(): Command[] {
  return [
    {
      id: 'flow-tracer:browse-flows',
      label: 'Flow Tracer: Browse Flows',
      category: 'view',
      icon: '➤',
      action: () => {
        dispatchIdeEvent(OPEN_FLOW_TRACER_EVENT);
      },
    },
    {
      id: 'flow-tracer:search',
      label: 'Flow Tracer: Search',
      category: 'view',
      icon: '\u{1F50D}',
      action: () => {
        dispatchIdeEvent(OPEN_FLOW_TRACER_EVENT);
      },
    },
  ];
}
