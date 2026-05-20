import { useState, useCallback, useEffect } from 'react';
import type { AppConfigResponse, ConfigUpdatePayload } from '../types';

const API_BASE = '/api';

export function useConfig() {
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [activeModel, setActiveModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AppConfigResponse = await res.json();
      setConfig(data);
      if (data.models.length > 0) {
        setActiveModel(data.models[0].name);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch config');
    }
  }, []);

  const updateConfig = useCallback(async (payload: ConfigUpdatePayload) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'ok') {
        if (payload.model) setActiveModel(payload.model);
        setConfig((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rewrite: {
              ...prev.rewrite,
              temperature: data.temperature ?? prev.rewrite.temperature,
              max_tokens: data.max_tokens ?? prev.rewrite.max_tokens,
              candidates_count:
                data.candidates_count ?? prev.rewrite.candidates_count,
            },
          };
        });
      }
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    activeModel,
    setActiveModel,
    updateConfig,
    loading,
    error,
    refetch: fetchConfig,
  };
}
