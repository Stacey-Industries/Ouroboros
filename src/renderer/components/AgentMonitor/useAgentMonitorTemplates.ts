import { useCallback, useEffect, useState } from 'react';

import type { AgentTemplate } from '../../types/electron';
import { resolveTemplate } from '../../utils/templateResolver';

interface UseAgentMonitorTemplatesResult {
  executeTemplate: (template: AgentTemplate) => void;
  templates: AgentTemplate[];
}

export function useAgentMonitorTemplates(projectRoot?: string | null): UseAgentMonitorTemplatesResult {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);

  useEffect(() => {
    window.electronAPI?.config?.get('agentTemplates').then((storedTemplates) => {
      if (storedTemplates) setTemplates(storedTemplates);
    }).catch((error) => { console.error('[agentMonitor] Failed to load agent templates:', error) });
  }, []);

  const executeTemplate = useCallback((template: AgentTemplate) => {
    const prompt = resolveTemplate(template.promptTemplate, buildTemplateContext(projectRoot));
    window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
      detail: { prompt, label: template.name, cliOverrides: template.cliOverrides },
    }));
  }, [projectRoot]);

  return { executeTemplate, templates };
}

function buildTemplateContext(projectRoot?: string | null) {
  const projectName = projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '';
  return { projectRoot, projectName, openFile: null, openFileName: null };
}
