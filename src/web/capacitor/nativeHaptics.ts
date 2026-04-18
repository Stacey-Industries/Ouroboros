/**
 * nativeHaptics.ts — haptic feedback bridge.
 *
 * On native (Android/iOS): delegates to @capacitor/haptics.
 * On web/browser: no-op (vibration API is deliberately not used as a fallback
 * — it is intrusive and not triggered by the same gestures).
 *
 * Phase G wires hapticSelection() to MobileNavBar tab switches and
 * hapticImpact() to the chat send button. This file is bridge layer only.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function toImpactStyle(style: 'light' | 'medium' | 'heavy'): ImpactStyle {
  if (style === 'light') return ImpactStyle.Light;
  if (style === 'medium') return ImpactStyle.Medium;
  return ImpactStyle.Heavy;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Trigger a selection-changed haptic hint (light tap).
 * Use for UI selection events such as tab switches.
 * Native: Haptics.selectionChanged(). Web: no-op.
 */
export async function hapticSelection(): Promise<void> {
  if (!isNativePlatform()) return;
  await Haptics.selectionChanged();
}

/**
 * Trigger an impact haptic feedback.
 * Use for confirmatory actions such as sending a chat message.
 * Native: Haptics.impact({ style }). Web: no-op.
 *
 * @param style Impact weight — defaults to 'medium'.
 */
export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium'): Promise<void> {
  if (!isNativePlatform()) return;
  await Haptics.impact({ style: toImpactStyle(style) });
}
