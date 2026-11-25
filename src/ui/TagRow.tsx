import { TAGS, type Tag } from '../core/tags';
import { toggleTag } from '../store';

/** One toggle per notebook mark. `only` limits the row to the quick ones, for the toast. */
export function TagRow({ id, tags, only, onTap }: { id: string; tags?: string[]; only?: readonly Tag[]; onTap?: () => void }) {
  const shown = only ? TAGS.filter((t) => only.includes(t.tag)) : TAGS;

  return (
    <div className="tags" role="group" aria-label="Notebook marks">
      {shown.map((t) => (
        <button
          key={t.tag}
          className="tag"
          aria-pressed={!!tags?.includes(t.tag)}
          aria-label={t.label}
          title={t.label}
          onClick={() => {
            void toggleTag(id, t.tag);
            onTap?.();
          }}
        >
          {t.mark}
        </button>
      ))}
    </div>
  );
}
