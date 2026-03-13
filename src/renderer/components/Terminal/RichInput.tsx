import React, { memo } from 'react';
import { RichInputBody } from './RichInputBody';
import type { RichInputProps } from './RichInputBody';

export type { RichInputProps } from './RichInputBody';

export const RichInput = memo(function RichInput(props: RichInputProps): React.ReactElement | null {
  return <RichInputBody {...props} />;
});
