import { useCallback, useRef, useState } from 'react';
import { listModels } from '@/lib/llm';
import type { ModelOption, ProviderId } from '@/lib/providers';

/** Model list for one provider. `load` doubles as key validation. Only the latest call wins. */
export function useModels(provider: ProviderId) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  const load = useCallback(
    async (apiKey: string) => {
      const call = ++latest.current;
      setLoading(true);
      setError('');
      try {
        const list = await listModels(provider, apiKey);
        if (call === latest.current) setModels(list);
      } catch (err) {
        if (call === latest.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (call === latest.current) setLoading(false);
      }
    },
    [provider],
  );

  const reset = useCallback(() => {
    latest.current++;
    setModels(null);
    setError('');
    setLoading(false);
  }, []);

  return { models, loading, error, load, reset };
}
