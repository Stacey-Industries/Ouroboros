/**
 * @vitest-environment jsdom
 *
 * AgentChatMessageActionIcons — smoke tests.
 * Each icon is a pure SVG component; verify it renders without throwing
 * and produces an <svg> element.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  BranchIcon,
  CheckIcon,
  CopyIcon,
  EditIcon,
  RetryIcon,
  RevertIcon,
  RewindIcon,
} from './AgentChatMessageActionIcons';

describe('AgentChatMessageActionIcons', () => {
  const icons: Array<[string, () => React.ReactElement]> = [
    ['EditIcon', EditIcon],
    ['RetryIcon', RetryIcon],
    ['BranchIcon', BranchIcon],
    ['CopyIcon', CopyIcon],
    ['CheckIcon', CheckIcon],
    ['RevertIcon', RevertIcon],
    ['RewindIcon', RewindIcon],
  ];

  for (const [name, Icon] of icons) {
    it(`${name} renders an <svg> without throwing`, () => {
      const { container } = render(<Icon />);
      expect(container.querySelector('svg')).not.toBeNull();
    });
  }
});
