'use client';

import { useEffect, useState, useRef } from 'react';
import { playSound } from '@/lib/sounds';

interface CountdownTimerProps {
  deadline: number;
  resolved?: boolean;
  inline?: boolean;
}

export function CountdownTimer({ deadline, resolved, inline = false }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, deadline - Date.now()));
  const warned = useRef(false);
  const alarmed = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setTimeLeft(remaining);

      if (remaining <= 30000 && remaining > 10000 && !warned.current) {
        warned.current = true;
        playSound('warning');
      }
      if (remaining <= 10000 && remaining > 0 && !alarmed.current) {
        alarmed.current = true;
        playSound('alarm');
      }
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [deadline]);

  const totalSeconds = Math.ceil(timeLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = timeLeft <= 10000 && timeLeft > 0;
  const isWarning = timeLeft <= 30000 && timeLeft > 10000;
  const isExpired = timeLeft === 0;

  const timerColor = resolved
    ? 'text-[#ededed]'
    : isExpired
    ? 'text-cyan-400'
    : isUrgent
    ? 'text-red-500'
    : isWarning
    ? 'text-amber-400'
    : 'text-[#ededed]';

  // Inline mode — compact for top bar
  if (inline) {
    if (resolved) {
      return <span className="font-pixel text-[16px] text-[#ededed] tracking-wider">REVEALED</span>;
    }
    if (isExpired) {
      return <span className="font-pixel text-[16px] text-cyan-400 tracking-wider animate-pulse">DECRYPTING</span>;
    }
    return (
      <span className={`font-pixel text-[20px] ${timerColor} tracking-[0.15em] tabular-nums ${isUrgent ? 'animate-pulse' : ''}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    );
  }

  // Full mode — standalone section
  if (resolved) {
    return (
      <div className="text-center">
        <div className="font-pixel text-[2.5rem] sm:text-[3.5rem] text-[#ededed] tracking-wider animate-pulse">
          REVEALED
        </div>
        <div className="text-[13px] font-mono text-green-500 tracking-widest mt-1">
          STRATEGIES DECRYPTED
        </div>
      </div>
    );
  }

  const pulseClass = isUrgent
    ? 'animate-pulse'
    : isWarning
    ? 'animate-[pulse_2s_ease-in-out_infinite]'
    : '';

  return (
    <div className="text-center">
      {isExpired ? (
        <>
          <div className="font-pixel text-[2.5rem] sm:text-[3.5rem] text-cyan-400 tracking-wider animate-pulse">
            DECRYPTING...
          </div>
          <div className="text-[13px] font-mono text-cyan-400/60 tracking-widest mt-1">
            BITE CTX SUBMITTING
          </div>
        </>
      ) : (
        <>
          <div className={`font-pixel text-[3rem] sm:text-[4.5rem] ${timerColor} ${pulseClass} tracking-[0.2em] tabular-nums`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          {isUrgent && (
            <div className="text-[13px] font-mono text-red-500 tracking-widest mt-1 animate-pulse">
              FINAL SECONDS
            </div>
          )}
          {!isUrgent && !isWarning && (
            <div className="text-[13px] font-mono text-[#333] tracking-widest mt-1">
              ARENA ACTIVE
            </div>
          )}
        </>
      )}
    </div>
  );
}
