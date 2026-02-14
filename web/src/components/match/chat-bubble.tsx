'use client';

import { useEffect, useState } from 'react';

interface ChatBubbleProps {
  message: string;
  agentColor: string;
  id: string;
  onDismiss: (id: string) => void;
  ttl?: number;
}

export function ChatBubble({ message, agentColor, id, onDismiss, ttl = 3500 }: ChatBubbleProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, ttl);
    return () => clearTimeout(timer);
  }, [id, ttl, onDismiss]);

  return (
    <div
      className="text-[12px] font-mono text-[#aaa] leading-relaxed transition-opacity duration-300 border-l-2 pl-3 truncate"
      style={{
        opacity: visible ? 1 : 0,
        borderLeftColor: agentColor,
      }}
    >
      {message}
    </div>
  );
}

interface ChatBubbleStackProps {
  bubbles: Array<{ id: string; agentId: string; message: string; color: string; timestamp: number }>;
  onDismiss: (id: string) => void;
}

export function ChatBubbleStack({ bubbles, onDismiss }: ChatBubbleStackProps) {
  if (bubbles.length === 0) return null;
  const latest = bubbles[bubbles.length - 1];

  return (
    <ChatBubble
      key={latest.id}
      id={latest.id}
      message={latest.message}
      agentColor={latest.color}
      onDismiss={onDismiss}
    />
  );
}
