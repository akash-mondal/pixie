'use client';

import { useState, useEffect } from 'react';

export function PoolTimer({ deadline }: { deadline: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, deadline - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (remaining <= 0) {
    return <span className="text-[11px] font-mono text-red-400">expired</span>;
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const urgency = remaining < 60 ? 'text-red-400' : remaining < 300 ? 'text-yellow-500' : 'text-[#444]';

  return (
    <div className={`text-[11px] font-mono ${urgency}`}>
      {hours > 0 && `${hours}h `}{minutes}m {seconds}s
    </div>
  );
}
