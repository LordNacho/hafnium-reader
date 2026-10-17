import { useEffect, useState } from 'react';

/** Bumped whenever stored data changes so screens can reload. */
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function notifyDataChanged() {
  version++;
  listeners.forEach((l) => l());
}

export function useDataVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
