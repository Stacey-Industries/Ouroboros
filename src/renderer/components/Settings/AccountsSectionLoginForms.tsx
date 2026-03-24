/**
 * AccountsSectionLoginForms.tsx — Inline login forms for provider cards.
 *
 * GitHub Device Flow UI and API Key input forms, extracted from
 * ProviderCard to stay under the 300-line ESLint file limit.
 */

import React from 'react';

import type { AuthProvider, GitHubLoginEvent } from '../../types/electron';
import * as S from './AccountsSectionStyles';
import { buttonStyle, smallButtonStyle } from './settingsStyles';
import type { AccountsSectionModel } from './useAccountsSection';

export function ExpandedArea({
  provider,
  model,
}: {
  provider: AuthProvider;
  model: AccountsSectionModel;
}): React.ReactElement {
  if (provider === 'github') {
    return <GitHubDeviceFlowArea model={model} />;
  }
  return <ApiKeyInputArea provider={provider} model={model} />;
}

function GitHubDeviceFlowArea({ model }: { model: AccountsSectionModel }): React.ReactElement {
  const event = model.githubLoginEvent;
  const isWaiting = event?.type === 'device_code';
  const hasError = event?.type === 'error';

  if (!isWaiting && !hasError) {
    return <GitHubStartPrompt model={model} />;
  }

  if (hasError) {
    return <GitHubErrorState message={event.message} model={model} />;
  }

  return <GitHubPollingState event={event} model={model} />;
}

function GitHubStartPrompt({ model }: { model: AccountsSectionModel }): React.ReactElement {
  return (
    <div style={S.actionAreaStyle}>
      <div className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
        Sign in via GitHub Device Flow. A code will be shown to enter on GitHub.
      </div>
      <div style={S.buttonRowStyle}>
        <button
          className="text-text-semantic-on-accent"
          style={{
            ...buttonStyle,
            background: 'var(--interactive-accent)',
            border: 'none',
            fontWeight: 600,
          }}
          onClick={() => void model.login('github')}
        >
          Start Sign In
        </button>
        <button
          className="text-text-semantic-muted"
          style={smallButtonStyle}
          onClick={model.collapseCard}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GitHubErrorState({
  message,
  model,
}: {
  message: string;
  model: AccountsSectionModel;
}): React.ReactElement {
  return (
    <div style={S.actionAreaStyle}>
      <div className="text-status-error" style={S.errorTextStyle}>
        {message}
      </div>
      <div style={S.buttonRowStyle}>
        <button
          className="text-text-semantic-primary"
          style={smallButtonStyle}
          onClick={() => void model.login('github')}
        >
          Retry
        </button>
        <button
          className="text-text-semantic-muted"
          style={smallButtonStyle}
          onClick={model.collapseCard}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeviceCodeButtons({
  verificationUri,
  model,
}: {
  verificationUri: string;
  model: AccountsSectionModel;
}): React.ReactElement {
  return (
    <div style={S.buttonRowStyle}>
      <button
        className="text-text-semantic-on-accent"
        style={{
          ...buttonStyle,
          background: 'var(--interactive-accent)',
          border: 'none',
          fontWeight: 600,
        }}
        onClick={() => void model.openExternal(verificationUri)}
      >
        Open GitHub
      </button>
      <button
        className="text-text-semantic-muted"
        style={smallButtonStyle}
        onClick={() => void model.cancelLogin('github')}
      >
        Cancel
      </button>
    </div>
  );
}

function GitHubPollingState({
  event,
  model,
}: {
  event: GitHubLoginEvent & { type: 'device_code' };
  model: AccountsSectionModel;
}): React.ReactElement {
  const { userCode, verificationUri } = event.info;
  return (
    <div style={S.actionAreaStyle}>
      <DeviceCodeDisplay
        userCode={userCode}
        copied={model.copied}
        onCopy={() => model.copyToClipboard(userCode)}
      />
      <DeviceCodeButtons verificationUri={verificationUri} model={model} />
      <div className="text-text-semantic-muted" style={S.pollingTextStyle}>
        Waiting for authorization...
      </div>
    </div>
  );
}

function DeviceCodeDisplay({
  userCode,
  copied,
  onCopy,
}: {
  userCode: string;
  copied: boolean;
  onCopy: () => void;
}): React.ReactElement {
  return (
    <>
      <div
        className="text-text-semantic-primary"
        style={S.deviceCodeStyle}
        onClick={onCopy}
        title="Click to copy"
      >
        {userCode}
      </div>
      <div className="text-text-semantic-muted" style={S.deviceCodeHintStyle}>
        {copied ? 'Copied!' : 'Click code to copy'}
      </div>
    </>
  );
}

function ApiKeyInputArea({
  provider,
  model,
}: {
  provider: AuthProvider;
  model: AccountsSectionModel;
}): React.ReactElement {
  const placeholder = provider === 'anthropic' ? 'sk-ant-...' : 'sk-...';
  const helpUrl = provider === 'openai' ? 'https://platform.openai.com/api-keys' : null;

  return (
    <div style={S.actionAreaStyle}>
      <div style={S.inputRowStyle}>
        <input
          type="password"
          className="text-text-semantic-primary"
          style={S.inputStyle}
          placeholder={placeholder}
          value={model.apiKeyInput}
          onChange={(e) => model.setApiKeyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void model.submitApiKey(provider);
          }}
          autoFocus
        />
      </div>
      {model.apiKeyError && (
        <div className="text-status-error" style={S.errorTextStyle}>
          {model.apiKeyError}
        </div>
      )}
      <ApiKeyActions provider={provider} model={model} helpUrl={helpUrl} />
    </div>
  );
}

function ApiKeySaveButton({
  provider,
  model,
}: {
  provider: AuthProvider;
  model: AccountsSectionModel;
}): React.ReactElement {
  return (
    <button
      className="text-text-semantic-on-accent"
      style={{
        ...buttonStyle,
        background: 'var(--interactive-accent)',
        border: 'none',
        fontWeight: 600,
      }}
      onClick={() => void model.submitApiKey(provider)}
    >
      Save
    </button>
  );
}

function ApiKeyActions({
  provider,
  model,
  helpUrl,
}: {
  provider: AuthProvider;
  model: AccountsSectionModel;
  helpUrl: string | null;
}): React.ReactElement {
  return (
    <div style={S.buttonRowStyle}>
      <ApiKeySaveButton provider={provider} model={model} />
      <button
        className="text-text-semantic-muted"
        style={smallButtonStyle}
        onClick={model.collapseCard}
      >
        Cancel
      </button>
      {helpUrl && (
        <button
          className="text-interactive-accent"
          style={S.linkTextStyle}
          onClick={() => void model.openExternal(helpUrl)}
        >
          Get your API key at platform.openai.com
        </button>
      )}
    </div>
  );
}
