import type { ByokProvider } from '@/engine/byok';

/**
 * Optional on-device persistence for the BYO-key sandbox. The key lives in
 * component memory by default; "remember on this device" writes it here.
 *
 * Deliberately its own localStorage entry, independent of the `ta:progress`
 * atom: progress export/import must never carry an API key.
 */

export const BYOK_STORAGE_KEY = 'ta:byok';

export interface StoredByok {
  version: 1;
  provider: ByokProvider;
  model: string;
  baseUrl?: string;
  apiKey: string;
}

const PROVIDERS: readonly ByokProvider[] = ['openai', 'anthropic', 'custom'];

export function loadStoredByok(): StoredByok | null {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      !PROVIDERS.includes(record.provider as ByokProvider) ||
      typeof record.model !== 'string' ||
      typeof record.apiKey !== 'string' ||
      record.apiKey.length === 0
    ) {
      return null;
    }
    return {
      version: 1,
      provider: record.provider as ByokProvider,
      model: record.model,
      apiKey: record.apiKey,
      ...(typeof record.baseUrl === 'string' && record.baseUrl.length > 0
        ? { baseUrl: record.baseUrl }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveStoredByok(config: StoredByok): void {
  try {
    localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage unavailable — the key simply stays memory-only
  }
}

export function clearStoredByok(): void {
  try {
    localStorage.removeItem(BYOK_STORAGE_KEY);
  } catch {
    // nothing stored
  }
}
