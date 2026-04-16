/**
 * ComposerProfile.tsx — Active-profile pill shown in the composer bar.
 *
 * Wave 26 Phase B.
 *
 * Displays the active session profile as a small clickable pill.
 * Clicking opens a dropdown to switch profiles. On switch, dispatches
 * DOM event `agent-ide:profile-switched` with { oldProfileId, newProfileId }.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { Profile } from '../../types/electron';

// ─── Event ────────────────────────────────────────────────────────────────────

export const PROFILE_SWITCHED_EVENT = 'agent-ide:profile-switched';

export interface ProfileSwitchedDetail {
  oldProfileId: string | null;
  newProfileId: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ComposerProfileProps {
  /** Current active profile ID for the session (null = none selected). */
  activeProfileId: string | null;
  /** Called when the user selects a different profile. */
  onSwitch: (profileId: string) => void;
}

// ─── Hook: profile list ───────────────────────────────────────────────────────

function useProfiles(): Profile[] {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    window.electronAPI.profileCrud.list()
      .then((res) => { if (res.success && res.profiles) setProfiles(res.profiles); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return window.electronAPI.profileCrud.onChanged((updated) => setProfiles(updated));
  }, []);

  return profiles;
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function DropdownItem({
  profile,
  isActive,
  onSelect,
  onClose,
}: {
  profile: Profile;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => { onSelect(profile.id); onClose(); }}
      style={isActive ? dropdownItemActiveStyle : dropdownItemStyle}
      className={isActive ? 'text-text-semantic-primary' : 'text-text-semantic-secondary'}
    >
      <span style={dropdownNameStyle}>{profile.name}</span>
      {profile.effort && (
        <span className="text-text-semantic-faint" style={dropdownBadgeStyle}>{profile.effort}</span>
      )}
    </button>
  );
}

function useOutsideClick(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEffect(() => {
    function handleOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [ref, onClose]);
}

function ProfileDropdown({
  profiles,
  activeId,
  onSelect,
  onClose,
}: {
  profiles: Profile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose);

  return (
    <div ref={ref} style={dropdownStyle} className="bg-surface-panel">
      {profiles.length === 0 && (
        <div className="text-text-semantic-muted" style={emptyDropdownStyle}>No profiles</div>
      )}
      {profiles.map((p) => (
        <DropdownItem
          key={p.id}
          profile={p}
          isActive={p.id === activeId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

// ─── ComposerProfile ──────────────────────────────────────────────────────────

export function ComposerProfile({ activeProfileId, onSwitch }: ComposerProfileProps): React.ReactElement {
  const profiles = useProfiles();
  const [open, setOpen] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const label = activeProfile?.name ?? 'No profile';

  const handleSelect = useCallback((profileId: string) => {
    if (profileId === activeProfileId) return;
    window.dispatchEvent(
      new CustomEvent<ProfileSwitchedDetail>(PROFILE_SWITCHED_EVENT, {
        detail: { oldProfileId: activeProfileId, newProfileId: profileId },
      }),
    );
    onSwitch(profileId);
  }, [activeProfileId, onSwitch]);

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={pillStyle}
        aria-label="Switch active profile"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={dotStyle} />
        <span className="text-text-semantic-secondary" style={labelStyle}>{label}</span>
        <span className="text-text-semantic-faint" style={chevronStyle}>▾</span>
      </button>
      {open && (
        <ProfileDropdown
          profiles={profiles}
          activeId={activeProfileId}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '2px 8px',
  borderRadius: '9999px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-inset)',
  cursor: 'pointer',
  fontSize: '11px',
  fontFamily: 'var(--font-ui)',
  whiteSpace: 'nowrap',
};

const dotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--interactive-accent)',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  maxWidth: '120px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const chevronStyle: React.CSSProperties = {
  fontSize: '9px',
  lineHeight: 1,
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 4px)',
  left: 0,
  minWidth: '180px',
  maxHeight: '240px',
  overflowY: 'auto',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  zIndex: 50,
  padding: '4px',
};

const dropdownItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  borderRadius: '5px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '12px',
};

const dropdownItemStyle: React.CSSProperties = dropdownItemBase;

const dropdownItemActiveStyle: React.CSSProperties = {
  ...dropdownItemBase,
  background: 'var(--interactive-selection)',
};

const dropdownNameStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dropdownBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  marginLeft: '8px',
  flexShrink: 0,
};

const emptyDropdownStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '12px',
};
