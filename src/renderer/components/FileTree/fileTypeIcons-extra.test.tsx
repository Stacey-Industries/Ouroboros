/**
 * fileTypeIcons-extra.test.tsx — smoke tests for fileTypeIcons-extra.tsx
 */

import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { CfgIcon, FolderOpenSvg, ImgIcon, LockIcon, ShIcon } from './fileTypeIcons-extra';

describe('ShIcon', () => {
  it('renders an svg', () => {
    const { container } = render(<ShIcon color="#fff" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('ImgIcon', () => {
  it('renders an svg', () => {
    const { container } = render(<ImgIcon color="#fff" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('CfgIcon', () => {
  it('renders an svg with spokes', () => {
    const { container } = render(<CfgIcon color="#fff" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });
});

describe('LockIcon', () => {
  it('renders an svg', () => {
    const { container } = render(<LockIcon color="#fff" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('FolderOpenSvg', () => {
  it('renders an svg', () => {
    const { container } = render(<FolderOpenSvg color="#fff" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
