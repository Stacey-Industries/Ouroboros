import React, { memo } from 'react';

import { useCommitHistoryModel } from './CommitHistory.model';
import { CommitHistoryView } from './CommitHistory.view';

export interface CommitHistoryProps {
  filePath: string;
  projectRoot: string;
}

export const CommitHistory = memo(function CommitHistory({
  filePath,
  projectRoot,
}: CommitHistoryProps): React.ReactElement {
  const model = useCommitHistoryModel({ filePath, projectRoot });
  return <CommitHistoryView {...model} />;
});
