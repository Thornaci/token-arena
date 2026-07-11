import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import {
  buildByokRequest,
  estimateCost,
  parseByokResponse,
  payloadBlocks,
  redactedHeaders,
  type ByokProvider,
  type ByokUsage,
  type ChatMessage,
} from '@/engine/byok';
import type { CountFn } from '@/engine/contextModel';
import { getModelProfile } from '@/engine/modelProfiles';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { loadTokenizer, type Tokenizer } from '@/lib/tokenizer';
import { clearStoredByok, loadStoredByok, saveStoredByok } from '@/stores/byok';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { GhostButton, PrimaryButton } from './shared';

const PROVIDERS: readonly ByokProvider[] = ['openai', 'anthropic', 'custom'];

/** Inspector profile per provider; claude-class carries the "estimate" note. */
const PROFILE_IDS: Record<ByokProvider, string> = {
  openai: 'gpt-class-128k',
  anthropic: 'claude-class-200k',
  custom: 'generic-128k',
};

type SendError =
  | { kind: 'http'; status: number; body: string }
  | { kind: 'network' }
  | { kind: 'parse'; message: string };

export default function ByokChat({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'byok-chat') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'completeAll') throw new Error('wrong pass type');
  const { introKey, systemPromptKey, maxOutputTokens, defaultModels } = lesson.params;
  const pass = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const stored = useMemo(() => loadStoredByok(), []);
  const [provider, setProvider] = useState<ByokProvider>(stored?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(stored?.apiKey ?? '');
  const [model, setModel] = useState(stored?.model ?? defaultModels[stored?.provider ?? 'openai']);
  const [baseUrl, setBaseUrl] = useState(stored?.baseUrl ?? '');
  const [remember, setRemember] = useState(stored !== null);
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');

  const systemPrompt = systemPromptKey ? t(systemPromptKey) : null;
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<SendError | null>(null);
  const [lastUsage, setLastUsage] = useState<ByokUsage | null>(null);
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null);

  const passedRef = useRef(false);

  useEffect(() => {
    void loadTokenizer('o200k_base').then(setTokenizer);
  }, []);

  const count: CountFn = useMemo(
    () => (tokenizer ? (text) => tokenizer.countTokens(text) : (text) => Math.ceil(text.length / 4)),
    [tokenizer],
  );

  const allMessages = useMemo<ChatMessage[]>(
    () => [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...history,
    ],
    [systemPrompt, history],
  );

  // The payload the NEXT send would ship: full history + the draft being typed.
  const pendingMessages = useMemo<ChatMessage[]>(
    () =>
      draft.trim().length > 0
        ? [...allMessages, { role: 'user' as const, content: draft }]
        : allMessages,
    [allMessages, draft],
  );

  const request = useMemo(
    () =>
      buildByokRequest(
        { provider, apiKey: apiKey || '…', model, baseUrl: baseUrl || undefined, maxOutputTokens },
        pendingMessages,
      ),
    [provider, apiKey, model, baseUrl, maxOutputTokens, pendingMessages],
  );
  const host = useMemo(() => {
    try {
      return new URL(request.url).host;
    } catch {
      return request.url;
    }
  }, [request.url]);

  // Live inspector mirror: the exact payload, token-counted with o200k.
  useEffect(() => {
    const state = {
      model: getModelProfile(PROFILE_IDS[provider]),
      blocks: payloadBlocks(pendingMessages, count),
      reservedOutput: maxOutputTokens,
    };
    showInspector(state);
    updateInspectorState(state);
  }, [provider, pendingMessages, count, maxOutputTokens]);

  const selectProvider = (next: ByokProvider) => {
    setProvider(next);
    setModel(defaultModels[next]);
    setError(null);
  };

  const forget = () => {
    clearStoredByok();
    setRemember(false);
    setApiKey('');
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || !apiKey || sending) return;
    const outgoing = [...allMessages, { role: 'user' as const, content }];
    setSending(true);
    setError(null);
    signalSend();
    const live = buildByokRequest(
      { provider, apiKey, model, baseUrl: baseUrl || undefined, maxOutputTokens },
      outgoing,
    );
    try {
      const response = await fetch(live.url, {
        method: 'POST',
        headers: live.headers,
        body: JSON.stringify(live.body),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 400);
        setError({ kind: 'http', status: response.status, body });
        return;
      }
      let parsed;
      try {
        parsed = parseByokResponse(provider, await response.json());
      } catch (parseError) {
        setError({
          kind: 'parse',
          message: parseError instanceof Error ? parseError.message : String(parseError),
        });
        return;
      }
      setHistory([...history, { role: 'user', content }, { role: 'assistant', content: parsed.text }]);
      setDraft('');
      setLastUsage(parsed.usage);
      if (remember) saveStoredByok({ version: 1, provider, model, apiKey, ...(baseUrl ? { baseUrl } : {}) });
      if (!passedRef.current) {
        passedRef.current = true;
        if (evaluate(pass, { type: 'counter', completed: 1 }).pass) onPass();
      }
    } catch {
      setError({ kind: 'network' });
    } finally {
      setSending(false);
    }
  };

  const prices =
    Number(priceIn) > 0 && Number(priceOut) > 0
      ? { inPerMTok: Number(priceIn), outPerMTok: Number(priceOut) }
      : null;

  const inputCls =
    'rounded border border-(--color-line) bg-(--color-surface) px-3 py-2 font-mono text-sm text-(--color-ink) focus:border-(--color-ice) focus:outline-none';

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-(--color-dim)">{t(introKey)}</p>

      {/* the prominent key warning */}
      <div className="ta-panel flex flex-col gap-1 border-l-4 border-l-(--color-amber) p-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-(--color-amber)">
          {t('byok_warning_title')}
        </p>
        <p className="text-sm text-(--color-dim)">{t('byok_warning_body', { host })}</p>
      </div>

      {/* connection form */}
      <div className="ta-panel ta-notched flex flex-col gap-4 p-4">
        <div role="radiogroup" aria-label={t('byok_provider_label')} className="flex flex-wrap gap-2">
          {PROVIDERS.map((candidate) => (
            <label
              key={candidate}
              className={`cursor-pointer rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                candidate === provider
                  ? 'border-(--color-ice) text-(--color-ice)'
                  : 'border-(--color-line) text-(--color-dim) hover:border-(--color-line-bright)'
              }`}
            >
              <input
                type="radio"
                name="byok-provider"
                className="sr-only"
                checked={candidate === provider}
                onChange={() => selectProvider(candidate)}
              />
              {t(`byok_provider_${candidate}`)}
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="byok-model" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('byok_model_label')}
            </label>
            <input id="byok-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
          </div>
          {provider === 'custom' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="byok-baseurl" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
                {t('byok_baseurl_label')}
              </label>
              <input
                id="byok-baseurl"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className={inputCls}
              />
              <p className="text-xs text-(--color-faint)">{t('byok_baseurl_hint')}</p>
            </div>
          )}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="byok-key" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('byok_key_label')}
            </label>
            <input
              id="byok-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className={inputCls}
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-(--color-dim)">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-(--color-phosphor)"
                />
                {t('byok_remember')}
              </label>
              {(remember || stored) && (
                <button type="button" onClick={forget} className="font-mono text-xs text-(--color-faint) underline decoration-dotted hover:text-(--color-ink)">
                  {t('byok_forget')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="byok-price-in" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('byok_price_in')}
            </label>
            <input id="byok-price-in" type="number" min="0" step="any" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="byok-price-out" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('byok_price_out')}
            </label>
            <input id="byok-price-out" type="number" min="0" step="any" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} className={inputCls} />
          </div>
          <p className="text-xs text-(--color-faint) sm:col-span-2">{t('byok_price_hint')}</p>
        </div>
      </div>

      {/* transcript */}
      {history.length > 0 && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {history.map((message, i) => (
            <li
              key={i}
              className={`ta-panel max-w-[85%] p-3 text-sm whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'self-end border-(--color-ice) text-(--color-ink)'
                  : 'self-start text-(--color-dim)'
              }`}
            >
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                {message.role === 'user' ? t('byok_block_user') : t('byok_block_assistant')}
              </span>
              {message.content}
            </li>
          ))}
        </ol>
      )}

      {/* usage + cost, from the provider's own numbers */}
      {lastUsage && (lastUsage.inputTokens !== undefined || lastUsage.outputTokens !== undefined) && (
        <p className="font-mono text-xs text-(--color-dim)">
          {t('byok_usage_line', {
            input: lastUsage.inputTokens ?? 0,
            output: lastUsage.outputTokens ?? 0,
          })}
          {prices && (
            <span className="text-(--color-amber)">
              {' '}
              {t('byok_cost_line', { cost: estimateCost(lastUsage, prices).toFixed(4) })}
            </span>
          )}
        </p>
      )}

      {error && (
        <div aria-live="polite" className="ta-panel border-l-4 border-l-(--color-alert) p-3">
          <p className="font-mono text-xs text-(--color-alert)">
            {error.kind === 'http' && t('byok_error_http', { status: error.status, body: error.body })}
            {error.kind === 'network' && t('byok_error_network')}
            {error.kind === 'parse' && t('byok_error_parse', { message: error.message })}
          </p>
        </div>
      )}

      {/* composer */}
      <div className="flex flex-col gap-2">
        <label htmlFor="byok-draft" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
          {t('byok_composer_label')}
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            id="byok-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className={`${inputCls} min-w-0 flex-1 resize-y`}
          />
          <PrimaryButton onClick={() => void send()} disabled={sending || !draft.trim() || !apiKey}>
            {sending ? t('byok_sending') : t('byok_send')}
          </PrimaryButton>
        </div>
        {!apiKey && <p className="font-mono text-xs text-(--color-faint)">{t('byok_no_key')}</p>}
        {history.length > 0 && (
          <GhostButton
            onClick={() => {
              setHistory([]);
              setLastUsage(null);
              setError(null);
            }}
          >
            {t('byok_reset')}
          </GhostButton>
        )}
      </div>

      {/* the exact payload, credentials redacted */}
      <details className="ta-panel p-3">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-(--color-dim)">
          {t('byok_payload_summary')}
        </summary>
        <pre className="mt-2 overflow-x-auto font-mono text-xs text-(--color-dim)">
          {JSON.stringify(
            { url: request.url, headers: redactedHeaders(request.headers), body: request.body },
            null,
            2,
          )}
        </pre>
        <p className="mt-2 text-xs text-(--color-faint)">{t('byok_estimate_note')}</p>
      </details>
    </div>
  );
}
