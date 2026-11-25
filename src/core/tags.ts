// Entry tags: the marks birders write after a name in a paper notebook. The table order is the display order.
import type { Sighting } from './types';

export const TAGS = [
  { tag: 'photo', mark: 'P', label: 'Camera photo', comment: 'Photographed.' },
  { tag: 'video', mark: 'V', label: 'Camera video', comment: 'Video.' },
  { tag: 'phoneVideo', mark: 'PV', label: 'Phone video', comment: 'Video.' },
  { tag: 'audio', mark: 'A', label: 'Sound recorded', comment: 'Audio recorded.' },
  { tag: 'male', mark: '♂', label: 'Male', comment: 'Male.' },
  { tag: 'female', mark: '♀', label: 'Female', comment: 'Female.' },
  { tag: 'juvenile', mark: 'juv', label: 'Juvenile', comment: 'Juvenile.' },
  { tag: 'breeding', mark: 'B', label: 'Breeding behaviour or nest', comment: 'Breeding behaviour.' },
  // Private: never written to eBird.
  { tag: 'lifer', mark: '★', label: 'Lifer', comment: undefined },
  { tag: 'checkId', mark: '?', label: 'Check ID from photos', comment: undefined }
] as const;

export type Tag = (typeof TAGS)[number]['tag'];

/** Tags that show a photo, video or sound exists, which eBird reviewers ask for on unusual birds. */
export const EVIDENCE_TAGS: readonly string[] = ['photo', 'video', 'phoneVideo', 'audio'];

/** Known tags of an entry, in table order. Tags from a newer app version are kept in storage but not shown. */
const known = (tags: readonly string[] | undefined) => TAGS.filter((t) => tags?.includes(t.tag));

/** "P ★": the marks shown after a bird's name. */
export const tagMarks = (tags: readonly string[] | undefined) =>
  known(tags)
    .map((t) => t.mark)
    .join(' ');

/** Species-comment phrases for a checklist line's entries, each once, in table order. */
export function tagComments(entries: Sighting[]): string[] {
  const phrases = known(entries.flatMap((s) => s.tags ?? [])).map((t) => t.comment);
  return [...new Set(phrases)].filter((c): c is NonNullable<typeof c> => !!c);
}

/** `tags` with `tag` switched on or off, in table order. */
export function toggled(tags: readonly string[] | undefined, tag: Tag): string[] {
  const set = new Set(tags);
  if (!set.delete(tag)) set.add(tag);
  const order = TAGS.map((t) => t.tag as string);
  return [...set].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}
