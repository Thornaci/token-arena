import { useEffect, useMemo, useState } from 'react';
import { ENCODINGS, type EncodingId } from '@/lib/tokenizer';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import TokenChips from './TokenChips';
import { useTokenizer } from './useTokenizer';

const MAX_INPUT = 5000;

interface Props {
  locale: Locale;
  defaultEncoding?: EncodingId;
  initialText?: string;
  /** Notifies challenge logic on every tokenization. */
  onTokenize?: (info: { text: string; tokens: number; encoding: EncodingId }) => void;
}

export default function TokenizerPlayground({
  locale,
  defaultEncoding = 'o200k_base',
  initialText = '',
  onTokenize,
}: Props) {
  const [encoding, setEncoding] = useState<EncodingId>(defaultEncoding);
  const [text, setText] = useState(initialText);
  const [showIds, setShowIds] = useState(false);
  const { tokenizer, loading, error } = useTokenizer(encoding);
  const t = (key: string) => lessonText(key, locale);
  const nf = new Intl.NumberFormat(locale);

  const pieces = useMemo(() => (tokenizer ? tokenizer.pieces(text) : []), [tokenizer, text]);

  useEffect(() => {
    if (tokenizer) onTokenize?.({ text, tokens: pieces.length, encoding });
  }, [tokenizer, text, pieces.length, encoding, onTokenize]);

  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const chars = [...text].length;

  return (
    <div className="ta-panel flex flex-col gap-3 p-4">
      {/* encoding tabs */}
      <div role="tablist" aria-label="encoding" className="flex flex-wrap gap-1 font-mono text-xs">
        {ENCODINGS.map((enc) => (
          <button
            key={enc}
            role="tab"
            aria-selected={encoding === enc}
            onClick={() => setEncoding(enc)}
            className={`rounded px-2.5 py-1.5 transition-colors ${
              encoding === enc
                ? 'bg-(--color-phosphor) font-semibold text-(--color-bg)'
                : 'bg-(--color-raised) text-(--color-dim) hover:text-(--color-ink)'
            }`}
          >
            {enc}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 px-2 text-(--color-dim)">
          <input
            type="checkbox"
            checked={showIds}
            onChange={(e) => setShowIds(e.target.checked)}
            className="accent-(--color-phosphor)"
          />
          {t('playground_show_ids')}
        </label>
      </div>

      <textarea
        value={text}
        maxLength={MAX_INPUT}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('playground_placeholder')}
        rows={3}
        spellCheck={false}
        className="w-full resize-y rounded border border-(--color-line-bright) bg-(--color-bg) p-3 font-mono text-sm text-(--color-ink) placeholder:text-(--color-faint)"
      />

      {/* readout */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono">
        <span className="text-2xl font-semibold text-(--color-phosphor) text-glow">
          {loading ? '…' : nf.format(pieces.length)}
        </span>
        <span className="text-xs uppercase tracking-widest text-(--color-dim)">
          {t('playground_tokens_label')}
        </span>
        <span className="ml-auto text-xs text-(--color-faint)">
          {nf.format(words)} {t('playground_words_label')} · {nf.format(chars)}{' '}
          {t('playground_chars_label')}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-(--color-alert)">{t('playground_load_error')}</p>
      ) : loading ? (
        <p className="font-mono text-xs text-(--color-faint)" aria-busy="true">
          {t('playground_loading_encoding')}
        </p>
      ) : text ? (
        <TokenChips pieces={pieces} showIds={showIds} />
      ) : null}
    </div>
  );
}
