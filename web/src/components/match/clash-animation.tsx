'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ClashData {
  id: string;
  agent1: { name: string; color: string };
  agent2: { name: string; color: string };
  pair: string;
  timestamp: number;
}

interface ClashOverlayProps {
  clashes: ClashData[];
  onComplete: (id: string) => void;
}

export function ClashOverlay({ clashes, onComplete }: ClashOverlayProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30">
      <AnimatePresence>
        {clashes.map(clash => (
          <ClashFlash key={clash.id} clash={clash} onComplete={() => onComplete(clash.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ClashFlash({ clash, onComplete }: { clash: ClashData; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="flex items-center gap-4 px-6 py-4 rounded-lg bg-[#0a0a0a]/90 border border-amber-500/30">
        <span className="text-[15px] font-mono font-medium" style={{ color: clash.agent1.color }}>
          {clash.agent1.name}
        </span>
        <span className="font-pixel text-[22px] text-amber-400 tracking-wider">VS</span>
        <span className="text-[15px] font-mono font-medium" style={{ color: clash.agent2.color }}>
          {clash.agent2.name}
        </span>
        <span className="text-[12px] font-mono text-[#666] ml-1">on {clash.pair}</span>
      </div>
    </motion.div>
  );
}
