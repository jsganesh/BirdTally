/** Hints are on unless the user switched them off, including for settings saved before the switch existed. */
export const hintsOn = (settings?: { showHints?: boolean }): boolean => settings?.showHints !== false;
