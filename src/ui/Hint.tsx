import { createContext, useContext, type ReactNode } from 'react';

export const HintsContext = createContext(true);

/** A short line under a button whose meaning is not obvious. Hidden when the user turns hints off in Setup. */
export function Hint({ children }: { children: ReactNode }) {
  return useContext(HintsContext) ? <p className="muted small" style={{ margin: 0 }}>{children}</p> : null;
}
