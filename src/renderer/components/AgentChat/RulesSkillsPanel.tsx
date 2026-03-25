import React from 'react';

import type { RulesFile, SkillDefinition } from '../../../shared/types/rulesAndSkills';
import {
  CreateSkillInline,
  RuleItem,
  SectionHeader,
  SkillItem,
} from './RulesSkillsPanelParts';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface RulesSkillsPanelProps {
  rules: RulesFile[];
  skills: SkillDefinition[];
  onOpenFile: (filePath: string) => void;
  onCreateRule: (type: 'claude-md' | 'agents-md') => Promise<void>;
  onCreateSkill: (name: string) => void;
  onOpenHooksSettings: () => void;
  isLoading: boolean;
}

// ── Rules section ─────────────────────────────────────────────────────────────

function RulesSection({
  rules,
  onOpenFile,
  onCreateRule,
}: {
  rules: RulesFile[];
  onOpenFile: (path: string) => void;
  onCreateRule: (type: 'claude-md' | 'agents-md') => void;
}): React.ReactElement {
  return (
    <div>
      <SectionHeader label="Rules" />
      {rules.length === 0 ? (
        <div className="px-3 py-1.5 text-[10px] text-text-semantic-muted">No rules files found</div>
      ) : (
        rules.map((rule) => (
          <RuleItem
            key={rule.type}
            rule={rule}
            onOpen={onOpenFile}
            onCreate={onCreateRule}
          />
        ))
      )}
    </div>
  );
}

// ── Skills section ─────────────────────────────────────────────────────────────

function SkillsSection({
  skills,
  onOpenFile,
  onCreateSkill,
}: {
  skills: SkillDefinition[];
  onOpenFile: (path: string) => void;
  onCreateSkill: (name: string) => void;
}): React.ReactElement {
  return (
    <div>
      <SectionHeader label="Skills" />
      {skills.length === 0 ? (
        <div className="px-3 py-1.5 text-[10px] text-text-semantic-muted">No skills defined</div>
      ) : (
        skills.map((skill) => (
          <SkillItem key={skill.id} skill={skill} onOpen={onOpenFile} />
        ))
      )}
      <CreateSkillInline onCreate={onCreateSkill} />
    </div>
  );
}

// ── Hooks section ─────────────────────────────────────────────────────────────

function HooksSection({
  onOpenHooksSettings,
}: {
  onOpenHooksSettings: () => void;
}): React.ReactElement {
  return (
    <div>
      <SectionHeader label="Hooks" />
      <div className="px-3 py-1.5">
        <button
          className="text-xs text-text-semantic-muted transition-colors duration-75"
          onClick={onOpenHooksSettings}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--interactive-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '';
          }}
        >
          Manage Hooks →
        </button>
      </div>
    </div>
  );
}

// ── Loading overlay ───────────────────────────────────────────────────────────

function LoadingRow(): React.ReactElement {
  return (
    <div className="px-3 py-2 text-[10px] text-text-semantic-muted animate-pulse">
      Loading…
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function RulesSkillsPanel({
  rules,
  skills,
  onOpenFile,
  onCreateRule,
  onCreateSkill,
  onOpenHooksSettings,
  isLoading,
}: RulesSkillsPanelProps): React.ReactElement {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto bg-surface-panel"
      style={{ scrollbarWidth: 'thin' }}
    >
      {isLoading && <LoadingRow />}
      <RulesSection
        rules={rules}
        onOpenFile={onOpenFile}
        onCreateRule={onCreateRule}
      />
      <div className="my-1 border-t border-border-semantic" />
      <SkillsSection
        skills={skills}
        onOpenFile={onOpenFile}
        onCreateSkill={onCreateSkill}
      />
      <div className="my-1 border-t border-border-semantic" />
      <HooksSection onOpenHooksSettings={onOpenHooksSettings} />
    </div>
  );
}
