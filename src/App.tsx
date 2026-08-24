import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Moon, PanelLeftClose, Sun, X } from 'lucide-react';
import reportCard from 'virtual:report-card';
import type { ModelEntry, ProviderEntry } from './data/types';
import { FilterBar } from './components/FilterBar';
import { ModelCard } from './components/ModelCard';
import { ModelDetail } from './components/ModelDetail';
import { filterModels } from './lib/filterModels';
import { useHashModel } from './lib/useHashModel';
import { useTheme } from './lib/useTheme';

type View = 'models' | 'harnesses';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';

interface ProviderNavigationProps {
  providers: ProviderEntry[];
  selectedProviderId: string | null;
  onSelect: (providerId: string | null) => void;
}

function ProviderNavigation({ providers, selectedProviderId, onSelect }: ProviderNavigationProps) {
  return (
    <nav className="provider-nav" aria-label="Provider index">
      <div className="provider-nav__intro">
        <PanelLeftClose aria-hidden="true" size={18} />
        <div>
          <p className="provider-nav__eyebrow">Provider index</p>
          <p className="provider-nav__caption">Technical reports</p>
        </div>
      </div>

      <p className="provider-nav__label">Providers</p>
      <div className="provider-nav__items">
        <button
          type="button"
          className="provider-nav__item"
          aria-pressed={selectedProviderId === null}
          onClick={() => onSelect(null)}
        >
          <span>All models</span>
          <span aria-hidden="true">{reportCard.models.length}</span>
        </button>
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="provider-nav__item"
            aria-pressed={selectedProviderId === provider.id}
            onClick={() => onSelect(provider.id)}
          >
            <span>{provider.name}</span>
            <span aria-hidden="true">{provider.models.length}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

interface ProviderDrawerProps extends ProviderNavigationProps {
  onClose: () => void;
}

function ProviderDrawer({ onClose, ...navigation }: ProviderDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="provider-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Provider navigation"
        onKeyDown={onKeyDown}
      >
        <div className="provider-drawer__header">
          <span>Browse reports</span>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close provider menu"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <ProviderNavigation {...navigation} />
      </div>
    </div>
  );
}

export default function App() {
  const [selectedId, setSelectedId] = useHashModel();
  const [view, setView] = useState<View>(() =>
    reportCard.harnesses.some((harness) => harness.id === selectedId) ? 'harnesses' : 'models',
  );
  const [query, setQuery] = useState('');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelAspect, setModelAspect] = useState<string | null>(null);
  const [harnessAspect, setHarnessAspect] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [theme, toggleTheme] = useTheme();

  const selected =
    reportCard.models.find((model) => model.id === selectedId) ??
    reportCard.harnesses.find((harness) => harness.id === selectedId) ??
    null;

  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
    }
  }, [selectedId, selected, setSelectedId]);

  const selectedIsHarness = selected
    ? reportCard.harnesses.some((harness) => harness.id === selected.id)
    : false;
  const activeView: View = selectedIsHarness ? 'harnesses' : view;
  const activeAspect = activeView === 'models' ? modelAspect : harnessAspect;
  const activeEntries = activeView === 'models' ? reportCard.models : reportCard.harnesses;
  const results = useMemo(
    () =>
      filterModels(activeEntries, {
        query,
        providerId: activeView === 'models' ? providerId : null,
        aspect: activeAspect,
      }),
    [activeAspect, activeEntries, providerId, query, activeView],
  );

  const groups = useMemo(() => {
    const byProvider = new Map<string, ModelEntry[]>();
    for (const model of results) {
      const bucket = byProvider.get(model.provider);
      if (bucket) bucket.push(model);
      else byProvider.set(model.provider, [model]);
    }
    return Array.from(byProvider, ([provider, models]) => ({ provider, models }));
  }, [results]);

  const selectedProvider = reportCard.providers.find((provider) => provider.id === providerId) ?? null;
  const title =
    activeView === 'harnesses'
      ? 'Harness reports'
      : selectedProvider
        ? `${selectedProvider.name} suite`
        : 'Model reports';
  const subtitle =
    activeView === 'harnesses'
      ? 'The apps and CLIs that shape how these models are actually used.'
      : selectedProvider
        ? `${results.length} observed ${results.length === 1 ? 'model' : 'models'} from ${selectedProvider.name}.`
        : `${reportCard.models.length} models from ${reportCard.providers.length} providers, organised by first-hand observations.`;
  const aspects = activeView === 'models' ? reportCard.aspects : reportCard.harnessAspects;

  const closeDrawer = () => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  const selectProvider = (nextProviderId: string | null) => {
    setProviderId(nextProviderId);
    closeDrawer();
  };

  const switchView = (nextView: View) => {
    setView(nextView);
    setDrawerOpen(false);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#dashboard-content">
        Skip to reports
      </a>

      <header className="dashboard-nav">
        <div className="dashboard-nav__inner">
          <div className="dashboard-nav__left">
            <span className="dashboard-nav__brand">{reportCard.title}</span>
            <nav className="dashboard-tabs" aria-label="Report category" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'models'}
                className="dashboard-tab"
                onClick={() => switchView('models')}
              >
                Models
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'harnesses'}
                className="dashboard-tab"
                onClick={() => switchView('harnesses')}
              >
                Harnesses
              </button>
            </nav>
          </div>
          <div className="dashboard-nav__actions">
            {activeView === 'models' ? (
              <button
                ref={menuButtonRef}
                type="button"
                className="icon-button dashboard-nav__menu"
                aria-label="Open provider menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu aria-hidden="true" size={18} />
              </button>
            ) : null}
            <button
              type="button"
              className="theme-toggle"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              onClick={toggleTheme}
            >
              {theme === 'light' ? (
                <Moon aria-hidden="true" size={16} />
              ) : (
                <Sun aria-hidden="true" size={16} />
              )}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className={`dashboard-layout dashboard-layout--${activeView}`}>
        {activeView === 'models' ? (
          <aside className="dashboard-sidebar" aria-hidden={drawerOpen}>
            <ProviderNavigation
              providers={reportCard.providers}
              selectedProviderId={providerId}
              onSelect={setProviderId}
            />
          </aside>
        ) : null}

        <main className="dashboard-main" id="dashboard-content" role="tabpanel">
          <div className="dashboard-main__inner">
            <header className="dashboard-heading">
              <div>
                <p className="dashboard-heading__eyebrow">
                  {activeView === 'models' ? 'Model evaluation' : 'Tool evaluation'}
                </p>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
              <p className="dashboard-heading__count">
                {results.length} {activeView === 'models' ? 'models' : 'harnesses'}
              </p>
            </header>

            <FilterBar
              aspects={aspects}
              query={query}
              aspect={activeAspect}
              resultCount={results.length}
              itemLabels={activeView === 'models' ? ['model', 'models'] : ['harness', 'harnesses']}
              onQueryChange={setQuery}
              onAspectChange={activeView === 'models' ? setModelAspect : setHarnessAspect}
              onReset={() => {
                setQuery('');
                if (activeView === 'models') setModelAspect(null);
                else setHarnessAspect(null);
              }}
            />

            <section
              className="report-gallery"
              aria-label={activeView === 'models' ? 'Model reports' : 'Harness reports'}
            >
              {results.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state__title">No reports match those filters.</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setQuery('');
                      if (activeView === 'models') setModelAspect(null);
                      else setHarnessAspect(null);
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : activeView === 'models' ? (
                groups.map((group) => (
                  <section
                    className="report-group"
                    key={group.provider}
                    aria-label={`${group.provider} reports`}
                  >
                    {providerId === null ? <h2>{group.provider}</h2> : null}
                    <div className="report-grid">
                      {group.models.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          highlightAspect={modelAspect}
                          onSelect={setSelectedId}
                        />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="report-grid">
                  {results.map((harness) => (
                    <ModelCard
                      key={harness.id}
                      model={harness}
                      highlightAspect={harnessAspect}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      <footer className="footer">
        <p>
          A personal, continuously updated record of first-hand use. These notes are not benchmark results,
          measurements, or universal advice. Generated from <code>LLM_REPORT_CARD.md</code>.
        </p>
      </footer>

      {drawerOpen ? (
        <ProviderDrawer
          providers={reportCard.providers}
          selectedProviderId={providerId}
          onSelect={selectProvider}
          onClose={closeDrawer}
        />
      ) : null}
      {selected ? (
        <ModelDetail
          model={selected}
          onClose={() => {
            if (selectedIsHarness) setView('harnesses');
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
