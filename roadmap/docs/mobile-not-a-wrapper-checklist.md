# Mobile "Not a Wrapper" Acceptance Checklist

Mirrors the Phase G acceptance gate in `roadmap/wave-33b-plan.md`.
Phase I (wave capstone) performs manual Android smoke and ticks these items.

---

## App shell

- [ ] App icon: custom, not the Capacitor default
- [ ] Splash screen: Ouroboros logo + `#0b0b0d` background, no "Powered by Capacitor" banner

## Status bar

- [ ] Status bar background color matches the active theme (`--surface-base`) on every screen
- [ ] Status bar text/icon style flips dark↔light with the theme (dark theme → white icons; light theme → dark icons)

## Safe-area insets

- [ ] Content respects `env(safe-area-inset-top/bottom/left/right)` on notched devices (Wave 32 CSS already handles this)

## Keyboard

- [ ] Chat composer floats above the soft keyboard (`--native-keyboard-height` from Capacitor Keyboard plugin; falls back to `--keyboard-inset` from visualViewport on web)

## System back (Android)

- [ ] Back button closes open drawer (file tree drawer) without navigating WebView history
- [ ] Back button closes open bottom sheet without navigating WebView history
- [ ] Back button cycles panels: terminal → editor → files → chat
- [ ] Back button on chat shows "press back again to exit" toast; second press within 2 s calls `App.exitApp()`

## Haptic feedback

- [ ] Tab switch in bottom nav triggers `Haptics.selectionChanged()` (light tap)
- [ ] Chat send button triggers `Haptics.impact({ style: ImpactStyle.Light })`

## Browser chrome

- [ ] No URL bar visible in release APK
- [ ] No "Open in Chrome" prompts on `ouroboros://` deep links (Phase E)

## Text selection

- [ ] UI chrome (nav bar, title bar, panel headers, buttons) does not show text-selection cursor on long-press
- [ ] Chat message bubbles allow text selection (data-user-select="text")
- [ ] Code blocks (`pre`, `code`) allow text selection
- [ ] Composer textarea and input fields allow text selection

## Share sheet (Phase C)

- [ ] Native share sheet appears for file paths and session links

## Deep link (Phase E)

- [ ] `ouroboros://pair?...` opens the app and routes to pairing screen with fields prefilled

## Token storage (Phase D)

- [ ] Pairing tokens stored in Android Keystore, not localStorage, when native

## Network resilience (Wave 33a)

- [ ] Switching Wi-Fi ↔ cellular triggers streaming resume, not full reload
- [ ] App backgrounded for 5 minutes then resumed does not require re-pair

## Performance

- [ ] 60 fps scroll in chat history on a Pixel 6a (mid-tier target)
- [ ] 60 fps scroll in file tree on a Pixel 6a
- [ ] Terminal output renders without frame drops on a Pixel 6a

## 44 px touch targets

- [ ] All bottom nav buttons ≥ 44 × 44 px (Wave 32 scanner verified)
- [ ] All title bar buttons ≥ 44 × 44 px on phone viewport
- [ ] All sidebar buttons ≥ 44 × 44 px on phone viewport

---

_Last updated: Wave 33b Phase G. Phase I will perform the manual Android smoke test and mark items ✅._
