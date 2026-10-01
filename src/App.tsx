import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import reportCard from 'virtual:report-card';
import { DeckView } from './components/DeckView';
import { Dossier } from './components/Dossier';
import { ShelfView } from './components/ShelfView';
import { SlotMachine } from './components/SlotMachine';
import { Ticker } from './components/Ticker';
import { TokensView } from './components/TokensView';
import { VersusView } from './components/VersusView';
import { isAsrEntry } from './lib/redesign';
import { useHashModel } from './lib/useHashModel';
import { useTheme } from './lib/useTheme';

type View = 'decide' | 'deck' | 'versus' | 'tokens' | 'harness' | 'voice';

const VIEWS: View[] = ['decide', 'deck', 'versus', 'tokens', 'harness', 'voice'];
const TAB_EMOJIS: Record<View, string> = {
  decide: '🎰',
  deck: '🃏',
  versus: '🥊',
  tokens: '🔥',
  harness: '🧰',
  voice: '🎙️',
};
const TAB_LABELS: Record<View, string> = {
  decide: 'Decide',
  deck: 'The Deck',
  versus: 'Versus',
  tokens: 'Tokens',
  harness: 'Harness',
  voice: 'Voice',
};

/**
 * The view a deep link opens: a harness id → Harness, an ASR model → Voice, any other
 * model → Deck, anything else → Decide.
 */
function viewForHash(id: string | null): View {
  if (!id) return 'decide';
  if (reportCard.harnesses.some((harness) => harness.id === id)) return 'harness';
  const model = reportCard.models.find((entry) => entry.id === id);
  if (model) return isAsrEntry(model) ? 'voice' : 'deck';
  return 'decide';
}

export default function App() {
  const [selectedId, setSelectedId] = useHashModel();
  const [theme, toggleTheme] = useTheme();

  const selected = useMemo(
    () =>
      reportCard.models.find((model) => model.id === selectedId) ??
      reportCard.harnesses.find((harness) => harness.id === selectedId) ??
      null,
    [selectedId],
  );

  // Deep links set the starting view; in-app selections (sticky notes, cards, reels) open
  // the dossier over whichever view the user is already on.
  const [view, setView] = useState<View>(() => viewForHash(selectedId));

  const searchRef = useRef<HTMLInputElement>(null);
  /** Registered by DeckView so the "r" shortcut can deal a random card once the Deck mounts. */
  const dealRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
    }
  }, [selectedId, selected, setSelectedId]);

  // Global shortcuts: 1–6 switch views, "/" deals into the Deck search, "r" deals a random
  // card. Ignored while typing, while a dialog is open, or with a modifier held.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, select, textarea')) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (/^[1-6]$/.test(event.key)) {
        setView(VIEWS[Number(event.key) - 1]);
      } else if (event.key === '/') {
        event.preventDefault();
        flushSync(() => setView('deck'));
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === 'r') {
        flushSync(() => setView('deck'));
        dealRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = VIEWS.indexOf(view);
    let nextIndex: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % VIEWS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + VIEWS.length) % VIEWS.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = VIEWS.length - 1;
    } else {
      return;
    }
    const nextView = VIEWS[nextIndex];
    setView(nextView);
    document.getElementById(`tab-${nextView}`)?.focus();
  };

  const voiceEntries = useMemo(() => reportCard.models.filter((model) => isAsrEntry(model)), []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="top">
        <div className="logo">
          <span className="logo__badge" aria-hidden="true">
            A+
          </span>
          {reportCard.title}
        </div>
        <nav className="tabs" role="tablist" aria-label="Views" onKeyDown={onTabKeyDown}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`tab-${v}`}
              aria-selected={view === v}
              aria-controls="main-content"
              tabIndex={view === v ? 0 : -1}
              className="tab"
              onClick={() => setView(v)}
            >
              <span aria-hidden="true">{TAB_EMOJIS[v]} </span>
              {TAB_LABELS[v]}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="chalk-toggle"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          onClick={toggleTheme}
        >
          <span aria-hidden="true">{theme === 'light' ? '🧑‍🏫 ' : '📄 '}</span>
          {theme === 'light' ? 'Chalkboard' : 'Paper'}
        </button>
      </header>

      <Ticker />

      <main id="main-content" role="tabpanel" aria-labelledby={`tab-${view}`}>
        {view === 'decide' ? <SlotMachine onSelectModel={setSelectedId} /> : null}
        {view === 'deck' ? (
          <DeckView onSelectModel={setSelectedId} searchRef={searchRef} dealRef={dealRef} />
        ) : null}
        {view === 'versus' ? <VersusView /> : null}
        {view === 'tokens' ? <TokensView onSelectModel={setSelectedId} /> : null}
        {view === 'harness' ? (
          <ShelfView
            title={
              <>
                <mark>Harness</mark>.
              </>
            }
            scribble="where models live"
            entries={reportCard.harnesses}
            aspects={reportCard.harnessAspects}
            onSelectModel={setSelectedId}
          />
        ) : null}
        {view === 'voice' ? (
          <ShelfView
            title={
              <>
                Voice-to-<mark>text</mark>.
              </>
            }
            scribble="not coding models!"
            entries={voiceEntries}
            aspects={reportCard.aspects}
            onSelectModel={setSelectedId}
          />
        ) : null}
      </main>

      <footer className="footer">first-hand notes, not benchmarks ✏️</footer>

      {selected ? <Dossier model={selected} onClose={() => setSelectedId(null)} /> : null}
    </>
  );
}
