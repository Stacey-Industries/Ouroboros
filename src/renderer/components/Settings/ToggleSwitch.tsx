import React, { useId } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: ToggleSwitchProps): React.ReactElement<any> {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div style={wrapperStyle(disabled)}>
      <SwitchButton
        id={id}
        checked={checked}
        labelId={labelId}
        descriptionId={descriptionId}
        disabled={disabled}
        onToggle={() => onChange(!checked)}
      />
      <SwitchText
        controlId={id}
        label={label}
        labelId={labelId}
        description={description}
        descriptionId={descriptionId}
        disabled={disabled}
      />
    </div>
  );
}

function SwitchButton({
  id,
  checked,
  labelId,
  descriptionId,
  disabled,
  onToggle,
}: {
  id: string;
  checked: boolean;
  labelId: string;
  descriptionId?: string;
  disabled: boolean;
  onToggle: () => void;
}): React.ReactElement<any> {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={onToggle}
      style={switchButtonStyle(checked, disabled)}
    >
      <span aria-hidden="true" style={switchKnobStyle(checked)} />
    </button>
  );
}

function SwitchText({
  controlId,
  label,
  labelId,
  description,
  descriptionId,
  disabled,
}: {
  controlId: string;
  label: string;
  labelId: string;
  description?: string;
  descriptionId?: string;
  disabled: boolean;
}): React.ReactElement<any> {
  return (
    <label htmlFor={controlId} style={textWrapperStyle(disabled)}>
      <div id={labelId} className="text-text-semantic-primary" style={labelStyle}>
        {label}
      </div>
      {description && (
        <div id={descriptionId} className="text-text-semantic-muted" style={descriptionStyle}>
          {description}
        </div>
      )}
    </label>
  );
}

const wrapperStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  opacity: disabled ? 0.5 : 1,
});

const switchButtonStyle = (checked: boolean, disabled: boolean): React.CSSProperties => ({
  flexShrink: 0,
  position: 'relative',
  width: '36px',
  height: '20px',
  borderRadius: '10px',
  border: '1px solid transparent',
  padding: 0,
  cursor: disabled ? 'not-allowed' : 'pointer',
  backgroundColor: checked ? 'var(--interactive-accent)' : 'var(--surface-raised)',
  transition: 'background-color 180ms ease',
  marginTop: '1px',
  outlineOffset: '2px',
});

const switchKnobStyle = (checked: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: '2px',
  left: checked ? '18px' : '2px',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  backgroundColor: 'var(--text-primary)',
  transition: 'left 180ms ease',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
});

const textWrapperStyle = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? 'not-allowed' : 'pointer',
  flex: 1,
});

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1.4,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  marginTop: '2px',
  lineHeight: 1.5,
};
