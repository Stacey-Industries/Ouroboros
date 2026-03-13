import React from 'react';
import { ContextBuilderBody } from './ContextBuilderBody';
import { ContextBuilderHeader } from './ContextBuilderHeader';
import type { ContextBuilderModel } from './useContextBuilderModel';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--bg)',
};

export function ContextBuilderView({
  onClose,
  ...model
}: ContextBuilderModel & { onClose: () => void }): React.ReactElement {
  return (
    <div style={containerStyle}>
      <ContextBuilderHeader
        onClose={onClose}
        scanning={model.scanning}
        statusMessage={model.statusMessage}
      />
      <ContextBuilderBody {...model} />
    </div>
  );
}
