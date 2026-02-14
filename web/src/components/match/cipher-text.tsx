'use client';

import { useEffect, useRef, useState } from 'react';

interface CipherTextProps {
  text: string;
  scrambling: boolean;
  duration?: number;
  className?: string;
  onComplete?: () => void;
}

const HEX = '0123456789abcdef';
const randomHex = (len: number) =>
  Array.from({ length: len }, () => HEX[Math.floor(Math.random() * 16)]).join('');

export function CipherText({ text, scrambling, duration = 600, className = '', onComplete }: CipherTextProps) {
  const [display, setDisplay] = useState(scrambling ? randomHex(text.length || 6) : text);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (scrambling) {
      // Continuously scramble
      const tick = () => {
        setDisplay(randomHex(Math.max(text.length, 6)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    } else {
      // Decode: progressively reveal final text from left to right
      startRef.current = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startRef.current;
        const progress = Math.min(1, elapsed / duration);
        const revealedCount = Math.floor(progress * text.length);

        const result = text
          .split('')
          .map((char, i) => (i < revealedCount ? char : HEX[Math.floor(Math.random() * 16)]))
          .join('');

        setDisplay(result);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(text);
          onComplete?.();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [scrambling, text, duration, onComplete]);

  return <span className={className}>{display}</span>;
}
