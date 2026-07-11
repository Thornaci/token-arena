import { useCallback, useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import {
  lookupPrerecorded,
  parseWorkerMessage,
  top1Drop,
  type Distribution,
  type PrerecordedFile,
  type WorkerRequest,
} from '@/engine/indecision';
import { normalizedEntropy } from '@/engine/mascot';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import {
  getStoredConsent,
  hasWebGpu,
  initialModelPhase,
  setStoredConsent,
} from '@/stores/localModel';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import ProbabilityWall from '@/components/game/parts/ProbabilityWall';
import { GhostButton, PrimaryButton } from './shared';

type Phase = 'boot' | 'consent' | 'loading' | 'live' | 'fallback';
type FallbackReason = 'nogpu' | 'declined' | 'error';

/**
 * One prompt's top-k, rendered identically for live and recorded data —
 * on the shared Probability Wall (same part the sampling lesson uses; the
 * renderer consumes the same distribution data structure either way).
 */
function DistributionBars({
  distribution,
  label,
  aria,
}: {
  distribution: Distribution;
  label: string;
  aria: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">{label}</p>
      <p className="font-mono text-sm text-(--color-dim)">
        “<span className="text-(--color-ink)">{distribution.prompt}</span>”
        <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
      </p>
      <ProbabilityWall candidates={distribution.candidates} ariaLabel={aria} heightPx={110} />
    </div>
  );
}

export default function ModelIndecision({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'model-indecision') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'completeAll') throw new Error('wrong pass type');
  const { modelRepo, dtype, downloadSizeMB, topK, prerecordedPath, pairs } = lesson.params;
  const pass = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [phase, setPhase] = useState<Phase>('boot');
  const [fallbackReason, setFallbackReason] = useState<FallbackReason | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [prerecorded, setPrerecorded] = useState<PrerecordedFile | null>(null);
  const [pairId, setPairId] = useState(pairs[0]!.id);
  const [baseDist, setBaseDist] = useState<Distribution | null>(null);
  const [contraDist, setContraDist] = useState<Distribution | null>(null);
  const [freePrompt, setFreePrompt] = useState('');
  const [freeDist, setFreeDist] = useState<Distribution | null>(null);
  const [busy, setBusy] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<number, { resolve: (d: Distribution) => void; reject: (e: Error) => void }>(),
  );
  const requestIdRef = useRef(0);
  const passedRef = useRef(false);

  const pair = pairs.find((p) => p.id === pairId) ?? pairs[0]!;

  const enterFallback = useCallback((reason: FallbackReason) => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setFallbackReason(reason);
    setPhase('fallback');
  }, []);

  const startWorker = useCallback(() => {
    setPhase('loading');
    setProgressPct(0);
    const worker = new Worker(new URL('../../workers/indecision.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent) => {
      const message = parseWorkerMessage(event.data);
      if (!message) return;
      if (message.type === 'progress') {
        setProgressPct(Math.round(message.pct));
      } else if (message.type === 'ready') {
        setPhase('live');
      } else if (message.type === 'result') {
        pendingRef.current.get(message.requestId)?.resolve(message.distribution);
        pendingRef.current.delete(message.requestId);
      } else if (message.type === 'error') {
        if (message.requestId !== undefined) {
          pendingRef.current.get(message.requestId)?.reject(new Error(message.message));
          pendingRef.current.delete(message.requestId);
        } else {
          // load failure (OOM, network, unsupported adapter) — never a dead lesson
          for (const waiting of pendingRef.current.values()) {
            waiting.reject(new Error(message.message));
          }
          pendingRef.current.clear();
          enterFallback('error');
        }
      }
    };
    const init: WorkerRequest = { type: 'init', modelRepo, dtype, topK };
    worker.postMessage(init);
  }, [modelRepo, dtype, topK, enterFallback]);

  // Decide the starting mode once, on the client.
  useEffect(() => {
    const initial = initialModelPhase(hasWebGpu(), getStoredConsent());
    if (initial === 'load') startWorker();
    else if (initial === 'need-consent') setPhase('consent');
    else enterFallback(hasWebGpu() ? 'declined' : 'nogpu');
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The recorded session backs the fallback mode (fetched once, same origin).
  useEffect(() => {
    if (phase !== 'fallback' || prerecorded) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    void fetch(`${base}/${prerecordedPath}`)
      .then((response) => response.json())
      .then((file: PrerecordedFile) => setPrerecorded(file))
      .catch(() => setInferError('prerecorded data failed to load'));
  }, [phase, prerecorded, prerecordedPath]);

  const inferLive = useCallback((prompt: string): Promise<Distribution> => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error('worker not running'));
    const requestId = ++requestIdRef.current;
    return new Promise<Distribution>((resolve, reject) => {
      pendingRef.current.set(requestId, { resolve, reject });
      const request: WorkerRequest = { type: 'infer', requestId, prompt };
      worker.postMessage(request);
    });
  }, []);

  const getDistribution = useCallback(
    async (which: 'base' | 'contradiction'): Promise<Distribution> => {
      const prompt = which === 'base' ? pair.basePrompt : pair.contradictionPrompt;
      if (phase === 'live') return inferLive(prompt);
      if (!prerecorded) throw new Error('recorded data still loading');
      return lookupPrerecorded(prerecorded, pair.id, which);
    },
    [phase, pair, prerecorded, inferLive],
  );

  // The mascot's uncertainty mirrors whatever distribution is on screen.
  useEffect(() => {
    const latest = freeDist ?? contraDist ?? baseDist;
    mascotReport({
      entropyNorm: latest ? normalizedEntropy(latest.candidates.map((c) => c.probability)) : null,
    });
  }, [baseDist, contraDist, freeDist]);

  const run = async (which: 'base' | 'contradiction') => {
    setBusy(true);
    setInferError(null);
    mascotEvent('send');
    try {
      const distribution = await getDistribution(which);
      if (which === 'base') setBaseDist(distribution);
      else setContraDist(distribution);
    } catch (error) {
      setInferError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runFree = async () => {
    if (!freePrompt.trim()) return;
    setBusy(true);
    setInferError(null);
    mascotEvent('send');
    try {
      setFreeDist(await inferLive(freePrompt));
    } catch (error) {
      setInferError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  // Completion: one full base-vs-contradiction comparison, either mode.
  useEffect(() => {
    if (!baseDist || !contraDist || passedRef.current) return;
    passedRef.current = true;
    if (evaluate(pass, { type: 'counter', completed: 1 }).pass) onPass();
  }, [baseDist, contraDist, pass, onPass]);

  const selectPair = (id: string) => {
    setPairId(id);
    setBaseDist(null);
    setContraDist(null);
    setInferError(null);
  };

  const drop = baseDist && contraDist ? top1Drop(baseDist, contraDist) : null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-(--color-dim)">{t('l6_2_intro')}</p>

      {phase === 'consent' && (
        <div className="ta-panel ta-notched flex flex-col gap-3 p-4">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-(--color-ink)">
            {t('l6_2_consent_title')}
          </h2>
          <p className="text-sm text-(--color-dim)">{t('l6_2_consent_body', { size: downloadSizeMB })}</p>
          <p className="font-mono text-xs text-(--color-faint)">{t('l6_2_consent_note')}</p>
          <div className="flex flex-wrap gap-3">
            <GhostButton
              onClick={() => {
                setStoredConsent('declined');
                enterFallback('declined');
              }}
            >
              {t('l6_2_consent_decline')}
            </GhostButton>
            <PrimaryButton
              onClick={() => {
                setStoredConsent('granted');
                startWorker();
              }}
            >
              {t('l6_2_consent_accept', { size: downloadSizeMB })}
            </PrimaryButton>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="ta-panel flex flex-col gap-2 p-4">
          <p className="font-mono text-xs text-(--color-dim)">{t('l6_2_loading', { pct: progressPct })}</p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label={t('l6_2_loading_aria')}
            className="h-2 overflow-hidden rounded-sm bg-(--color-surface)"
          >
            <div
              className="h-full bg-(--color-phosphor) motion-safe:transition-[width]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'fallback') && (
        <div className="ta-panel ta-notched flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                phase === 'live'
                  ? 'border-(--color-phosphor-deep) text-(--color-phosphor)'
                  : 'border-(--color-amber) text-(--color-amber)'
              }`}
            >
              {phase === 'live' ? t('l6_2_live_tag') : t('l6_2_recorded_tag')}
            </span>
            <span className="font-mono text-xs text-(--color-faint)">{modelRepo}</span>
          </div>

          {phase === 'fallback' && fallbackReason && (
            <p className="font-mono text-xs text-(--color-dim)">
              {t(`l6_2_fallback_${fallbackReason}`)}{' '}
              {hasWebGpu() && (
                <button
                  type="button"
                  className="underline decoration-dotted text-(--color-ice)"
                  onClick={() => setPhase('consent')}
                >
                  {t('l6_2_try_live')}
                </button>
              )}
            </p>
          )}

          {/* scenario picker */}
          <div
            role="radiogroup"
            aria-label={t('l6_2_pair_label')}
            className="flex flex-wrap gap-2"
          >
            {pairs.map((candidate) => (
              <label
                key={candidate.id}
                className={`cursor-pointer rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                  candidate.id === pair.id
                    ? 'border-(--color-ice) text-(--color-ice)'
                    : 'border-(--color-line) text-(--color-dim) hover:border-(--color-line-bright)'
                }`}
              >
                <input
                  type="radio"
                  name="l6-2-pair"
                  className="sr-only"
                  checked={candidate.id === pair.id}
                  onChange={() => selectPair(candidate.id)}
                />
                {t(candidate.labelKey)}
              </label>
            ))}
          </div>

          {/* the comparison */}
          <div className="flex flex-col gap-4 md:flex-row">
            {baseDist ? (
              <DistributionBars
                distribution={baseDist}
                label={t('l6_2_base_label')}
                aria={t('l6_2_dist_aria')}
              />
            ) : (
              <div className="flex-1">
                <PrimaryButton onClick={() => void run('base')} disabled={busy}>
                  {busy ? t('l6_2_thinking') : t('l6_2_run_base')}
                </PrimaryButton>
              </div>
            )}
            {baseDist &&
              (contraDist ? (
                <DistributionBars
                  distribution={contraDist}
                  label={t('l6_2_contra_label')}
                  aria={t('l6_2_dist_aria')}
                />
              ) : (
                <div className="flex-1">
                  <PrimaryButton onClick={() => void run('contradiction')} disabled={busy}>
                    {busy ? t('l6_2_thinking') : t('l6_2_inject')}
                  </PrimaryButton>
                </div>
              ))}
          </div>

          {drop && (
            <div aria-live="polite" className="flex flex-col gap-1">
              <p className="font-mono text-sm text-(--color-amber)">
                {t('l6_2_verdict', {
                  from: (drop.from * 100).toFixed(1),
                  to: (drop.to * 100).toFixed(1),
                })}
              </p>
              {drop.to < drop.from && (
                <p className="text-sm text-(--color-dim)">{t('l6_2_verdict_flat')}</p>
              )}
            </div>
          )}

          {inferError && (
            <p className="font-mono text-xs text-(--color-alert)">
              {t('l6_2_infer_error', { message: inferError })}
            </p>
          )}

          {(baseDist || contraDist) && (
            <GhostButton onClick={() => selectPair(pair.id)}>{t('l6_2_rerun')}</GhostButton>
          )}

          <p className="font-mono text-xs text-(--color-faint)">{t('l6_2_tail_note')}</p>

          {/* live-only progressive enhancement: type anything */}
          {phase === 'live' && (
            <div className="flex flex-col gap-2 border-t border-(--color-line) pt-4">
              <label
                htmlFor="l6-2-free"
                className="font-mono text-xs uppercase tracking-widest text-(--color-faint)"
              >
                {t('l6_2_free_label')}
              </label>
              <p className="text-xs text-(--color-dim)">{t('l6_2_free_note')}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  id="l6-2-free"
                  type="text"
                  value={freePrompt}
                  onChange={(e) => setFreePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runFree();
                  }}
                  className="min-w-0 flex-1 rounded border border-(--color-line) bg-(--color-surface) px-3 py-2 font-mono text-sm text-(--color-ink) focus:border-(--color-ice) focus:outline-none"
                />
                <PrimaryButton onClick={() => void runFree()} disabled={busy || !freePrompt.trim()}>
                  {t('l6_2_free_run')}
                </PrimaryButton>
              </div>
              {freeDist && (
                <DistributionBars
                  distribution={freeDist}
                  label={t('l6_2_free_label')}
                  aria={t('l6_2_dist_aria')}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
