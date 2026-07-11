import { useEffect, useState } from 'react';
import { loadTokenizer, type EncodingId, type Tokenizer } from '@/lib/tokenizer';

export interface TokenizerHandle {
  tokenizer: Tokenizer | null;
  loading: boolean;
  error: boolean;
}

/** Lazily loads a BPE encoding (each is a multi-MB chunk) and swaps on change. */
export function useTokenizer(encoding: EncodingId): TokenizerHandle {
  const [handle, setHandle] = useState<TokenizerHandle>({
    tokenizer: null,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    setHandle((h) => (h.tokenizer?.encoding === encoding ? h : { ...h, loading: true, error: false }));
    loadTokenizer(encoding)
      .then((tokenizer) => {
        if (!cancelled) setHandle({ tokenizer, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setHandle({ tokenizer: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [encoding]);

  return handle;
}
