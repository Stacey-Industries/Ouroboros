import React from 'react';

import {
  CollapsibleSection,
  GeneratedTypesContent,
  HowItWorksContent,
} from './CodeModeSectionDisclosures';
import { CodeModeOverview, ErrorBanner } from './CodeModeSectionOverview';
import type { CodeModeSectionModel } from './useCodeModeSectionModel';

export function CodeModeSectionView(props: CodeModeSectionModel): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <ErrorBanner error={props.error} />
      <CodeModeOverview {...props} />
      <CollapsibleSection
        isOpen={props.isTypesOpen}
        onToggle={() => props.setIsTypesOpen((value) => !value)}
        title="Generated Types"
      >
        <GeneratedTypesContent
          generatedTypes={props.generatedTypes}
          isEnabled={props.isEnabled}
        />
      </CollapsibleSection>
      <CollapsibleSection
        isOpen={props.isHowItWorksOpen}
        onToggle={() => props.setIsHowItWorksOpen((value) => !value)}
        title="How It Works"
      >
        <HowItWorksContent />
      </CollapsibleSection>
    </div>
  );
}
