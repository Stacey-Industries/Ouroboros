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
import { createPortal } from 'react-dom';

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
    window.electronAPI.profileCrud
      .list()
      .then((res) => {
        if (res.success && res.profiles) setProfiles(res.profiles);
      })
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
      onClick={() => {
        onSelect(profile.id);
        onClose();
      }}
      style={isActive ? dropdownItemActiveStyle : dropdownItemStyle}
      className={isActive ? 'text-text-semantic-primary' : 'text-text-semantic-secondary'}
    >
      <span style={dropdownNameStyle}>{profile.name}</span>
      {profile.effort && (
        <span className="text-text-semantic-faint" style={dropdownBadgeStyle}>
          {profile.effort}
        </span>
      )}
    </button>
  );
}

function useDropdownOverlay(args: {
  open: boolean;
  close: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  updatePosition: () => void;
}): void {
  useEffect(() => {
    if (!args.open) return;
    function handleOutside(event: MouseEvent): void {
      const target = event.target as Node;
      if (args.buttonRef.current?.contains(target) || args.menuRef.current?.contains(target))
        return;
      args.close();
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') args.close();
    }
    function handleWindowChange(): void {
      args.updatePosition();
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [args]);
}

function ProfileDropdown({
  profiles, activeId, onSelect, onClose, menuRef, style,
}: {
  profiles: Profile[]; activeId: string | null; onSelect: (id: string) => void;
  onClose: () => void; menuRef: React.RefObject<HTMLDivElement | null>; style: React.CSSProperties;
}): React.ReactElement {
  return (
    <div ref={menuRef} role="listbox" aria-label="Session profiles"
      style={{ ...dropdownStyle, ...style, ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) }}
      className="bg-surface-overlay"
    >
      {profiles.length === 0 && <div className="text-text-semantic-muted" style={emptyDropdownStyle}>No profiles</div>}
      {profiles.map((p) => (
        <DropdownItem key={p.id} profile={p} isActive={p.id === activeId} onSelect={onSelect} onClose={onClose} />
      ))}
    </div>
  );
}

// ─── ComposerProfile ──────────────────────────────────────────────────────────

type MenuPos = { left: number; bottom: number; width: number };

function useProfileDropdownState(activeProfileId: string | null, onSwitch: (id: string) => void) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const updateMenuPos = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
      width: Math.max(rect.width, 180),
    });
  }, []);
  const handleToggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    updateMenuPos();
    setOpen(true);
  }, [close, open, updateMenuPos]);
  const handleSelect = useCallback(
    (profileId: string) => {
      if (profileId === activeProfileId) return;
      window.dispatchEvent(
        new CustomEvent<ProfileSwitchedDetail>(PROFILE_SWITCHED_EVENT, {
          detail: { oldProfileId: activeProfileId, newProfileId: profileId },
        }),
      );
      onSwitch(profileId);
    },
    [activeProfileId, onSwitch],
  );

  useDropdownOverlay({ open, close, buttonRef, menuRef, updatePosition: updateMenuPos });
  return { open, menuPos, buttonRef, menuRef, close, handleToggle, handleSelect };
}

function ProfilePill({
  buttonRef,
  label,
  open,
  handleToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  label: string;
  open: boolean;
  handleToggle: () => void;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      style={{ ...pillStyle, ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) }}
      aria-label="Switch active profile"
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <span style={dotStyle} />
      <span className="text-text-semantic-secondary" style={labelStyle}>
        {label}
      </span>
      <span className="text-text-semantic-faint" style={chevronStyle}>
        ▾
      </span>
    </button>
  );
}

export function ComposerProfile({
  activeProfileId,
  onSwitch,
}: ComposerProfileProps): React.ReactElement {
  const profiles = useProfiles();
  const { open, menuPos, buttonRef, menuRef, close, handleToggle, handleSelect } =
    useProfileDropdownState(activeProfileId, onSwitch);
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const label = activeProfile?.name ?? 'No profile';

  return (
    <div style={wrapStyle}>
      <ProfilePill buttonRef={buttonRef} label={label} open={open} handleToggle={handleToggle} />
      {open &&
        menuPos &&
        createPortal(
          <ProfileDropdown
            profiles={profiles}
            activeId={activeProfileId}
            onSelect={handleSelect}
            onClose={close}
            menuRef={menuRef}
            style={{
              position: 'fixed',
              left: menuPos.left,
              bottom: menuPos.bottom,
              width: menuPos.width,
            }}
          />,
          document.body,
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
  color: 'var(--text-semantic-primary)',
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
  minWidth: '180px',
  maxHeight: '240px',
  overflowY: 'auto',
  border: '1px solid var(--border-semantic)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  zIndex: 9999,
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
