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
}: ToggleSwitchProps): React.ReactElement {
  const id = useId();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          position: 'relative',
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          border: 'none',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
          transition: 'background-color 180ms ease',
          outline: 'none',
          marginTop: '1px',
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent), 0 0 0 4px transparent';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'var(--text)',
            transition: 'left 180ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </button>

      <label
        htmlFor={id}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          flex: 1,
        }}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.4,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '2px',
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        )}
      </label>
    </div>
  );
}
