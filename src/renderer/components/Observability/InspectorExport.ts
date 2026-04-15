/**
 * InspectorExport.ts — HAR-like JSON export action for the Orchestration Inspector.
 *
 * Calls observability:exportTrace via IPC and shows a toast confirming the save path.
 */

export interface ExportResult {
  filePath: string;
}

export async function exportTraceAsHar(
  sessionId: string,
  format: 'har' | 'json' = 'json',
): Promise<ExportResult | null> {
  if (!sessionId) {
    console.warn('[InspectorExport] exportTraceAsHar called with empty sessionId');
    return null;
  }

  const result = await window.electronAPI.observability.exportTrace({ sessionId, format });

  if (!result.success || !result.filePath) {
    console.error('[InspectorExport] exportTrace failed:', result.error);
    return null;
  }

  return { filePath: result.filePath };
}
