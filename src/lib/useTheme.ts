import { useCallback, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';
type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'llm-report-card-theme';

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = useMemo(() => (preference === 'system' ? system : preference), [preference, system]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const sync = () => setSystem(media.matches ? 'dark' : 'light');
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setPreference((current) => {
      const next = (current === 'system' ? system : current) === 'light' ? 'dark' : 'light';
      try {
        window.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing and test environments may deny persistent storage.
      }
      return next;
    });
  }, [system]);

  return [theme, toggle];
}
