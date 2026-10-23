import { useEffect, useState } from 'react';
import { loadReference, type Reference } from './reference';

export function useReference() {
  const [ref, setRef] = useState<Reference | null>(null);
  useEffect(() => { loadReference().then(setRef).catch(() => setRef(null)); }, []);
  return ref;
}
