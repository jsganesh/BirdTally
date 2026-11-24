import { useMemo, useRef, useState } from 'react';
import { isAmbiguous, searchTaxa } from '../core/taxonomy';
import { useTaxonomy, useSettings } from './hooks';
import { displayNames } from '../core/taxonomy';
import { useRegion } from './useRegion';

/**
 * The always-visible "add a bird" field. Tap → type 2–3 letters → tap a result = saved.
 * Enter saves the top result, so a keyboard user can add a bird without touching the list.
 */
export function AddBar({ recent, regional, onPick }: { recent: string[]; regional?: string[]; onPick: (code: string) => void }) {
  const { index, info } = useTaxonomy();
  const settings = useSettings();
  const region = useRegion();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [chose, setChose] = useState(false); // used the arrow keys: Enter then means that row
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (q.trim() ? searchTaxa(index, q, { recent, regional, limit: 12 }) : []), [q, index, recent, regional]);
  const locales = settings?.displayLocales ?? ['en'];
  const unsure = isAmbiguous(hits) && !chose;

  const pick = (code: string) => {
    onPick(code);
    setQ('');
    setSel(0);
    setChose(false);
    inputRef.current?.blur();
  };

  return (
    <div className="addbar">
      <div className="addbar-inner">
        {q.trim() && (
          <div className="results" role="listbox" aria-label="Matching species">
            {hits.length === 0 && (
              <div className="result">
                <span className="name">{info ? 'No match' : 'Download the species list first (Setup tab)'}</span>
                <span className="meta">{info ? 'Try another spelling, a 4-letter code, or save as “Unknown bird”.' : 'Names are stored on this device so search works offline.'}</span>
              </div>
            )}
            {unsure && (
              <div className="result">
                <span className="meta">Several birds match “{q.trim()}”. Tap the one you saw.</span>
              </div>
            )}
            {hits.map((h, i) => {
              const alt = displayNames(h.taxon, locales).others.join(' · ');
              return (
                <button
                  key={h.taxon.code}
                  role="option"
                  aria-selected={i === sel && !unsure}
                  className={`result ${i === sel && !unsure ? 'sel' : ''} ${region.unusual(h.taxon.code) ? 'unusual' : ''}`}
                  onClick={() => pick(h.taxon.code)}
                >
                  <span className="name">{h.taxon.en}</span>
                  <span className="meta">
                    {[region.unusual(h.taxon.code) ? 'unusual here' : '', alt, h.taxon.sci, h.taxon.category !== 'species' ? h.taxon.category : ''].filter(Boolean).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Add a bird: type a name or code"
          placeholder="Add bird — name or code"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            setChose(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setChose(true);
              setSel((s) => Math.min(s + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setChose(true);
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter' && hits[sel]) {
              e.preventDefault();
              if (!unsure) pick(hits[sel].taxon.code);
            } else if (e.key === 'Escape') setQ('');
          }}
        />
      </div>
    </div>
  );
}
