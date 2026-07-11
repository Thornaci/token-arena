/**
 * Consent + capability state for the L6.2 in-browser model. Pure decision
 * logic lives here (Node-testable); the mechanic component drives the
 * transitions and owns the worker handle.
 *
 * Consent is device-specific, so it persists in its own localStorage entry —
 * never inside `ta:progress`, which users export across machines.
 */

export type ModelConsent = 'granted' | 'declined';

export const WEBGPU_CONSENT_KEY = 'ta:webgpu-consent';

/**
 * What the mechanic shows on mount.
 * - 'fallback'     — no WebGPU, or the user declined: pre-recorded data, same UI
 * - 'need-consent' — WebGPU available, no decision recorded yet
 * - 'load'         — consent already granted: start the worker immediately
 */
export type InitialModelPhase = 'fallback' | 'need-consent' | 'load';

export function initialModelPhase(hasGpu: boolean, consent: ModelConsent | null): InitialModelPhase {
  if (!hasGpu) return 'fallback';
  if (consent === 'granted') return 'load';
  if (consent === 'declined') return 'fallback';
  return 'need-consent';
}

export function hasWebGpu(): boolean {
  // `in` check only — lib.dom has no WebGPU types and we don't add @webgpu/types.
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function getStoredConsent(): ModelConsent | null {
  try {
    const raw = localStorage.getItem(WEBGPU_CONSENT_KEY);
    return raw === 'granted' || raw === 'declined' ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(consent: ModelConsent): void {
  try {
    localStorage.setItem(WEBGPU_CONSENT_KEY, consent);
  } catch {
    // storage unavailable — consent lasts for this page view only
  }
}

export function clearStoredConsent(): void {
  try {
    localStorage.removeItem(WEBGPU_CONSENT_KEY);
  } catch {
    // nothing stored
  }
}
