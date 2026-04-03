/**
 * AI API types — inline completions and future AI-powered editor features.
 */

export interface AiInlineCompletionRequest {
  filePath: string;
  languageId: string;
  textBeforeCursor: string;
  textAfterCursor: string;
  openTabContext?: Array<{ filePath: string; snippet: string }>;
}

export interface AiInlineCompletionResponse {
  success: boolean;
  completion?: string;
  error?: string;
}

export interface AiCommitMessageRequest {
  diff: string;
  recentCommits?: string;
}

export interface AiCommitMessageResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface AiInlineEditRequest {
  filePath: string;
  languageId: string;
  selectedCode: string;
  fullFileContent: string;
  selectionRange: { startLine: number; endLine: number };
  instruction: string;
}

export interface AiInlineEditResponse {
  success: boolean;
  editedCode?: string;
  error?: string;
}

export interface AiAPI {
  inlineCompletion: (
    request: AiInlineCompletionRequest,
  ) => Promise<AiInlineCompletionResponse>;
  generateCommitMessage: (
    request: AiCommitMessageRequest,
  ) => Promise<AiCommitMessageResponse>;
  inlineEdit: (
    request: AiInlineEditRequest,
  ) => Promise<AiInlineEditResponse>;
}
