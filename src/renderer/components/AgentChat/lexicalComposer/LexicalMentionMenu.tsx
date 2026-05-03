/**
 * LexicalMentionMenu.tsx — custom menuComponent wrapper for
 * BeautifulMentionsPlugin.
 *
 * The default LexicalTypeaheadMenuPlugin renders the menu BELOW the cursor
 * and only flips above if there's room within the contenteditable root —
 * which the chat composer rarely has, so the menu lands off-screen below
 * the composer pill (Wave 81 smoke fix). This component flips the menu
 * above the cursor unconditionally via `position: absolute; bottom: 100%`.
 *
 * `loading` is a library-internal prop, not a DOM attribute — strip it
 * before forwarding to the underlying <ul> so React doesn't warn.
 */
import type { BeautifulMentionsMenuProps } from 'lexical-beautiful-mentions';
import React from 'react';

export const LexicalMentionMenu = React.forwardRef<HTMLUListElement, BeautifulMentionsMenuProps>(
  function LexicalMentionMenu({ loading, ...rest }, ref) {
    void loading; // library-internal flag, not a DOM attribute — strip from forward
    return (
      <ul
        ref={ref}
        {...rest}
        className="absolute bottom-full left-0 z-50 mb-1 max-h-[280px] w-80 overflow-y-auto rounded-lg border border-border-semantic bg-surface-overlay py-1 shadow-xl"
      />
    );
  },
);
