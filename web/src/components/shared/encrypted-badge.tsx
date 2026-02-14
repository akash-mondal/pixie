export function EncryptedBadge({ revealed }: { revealed: boolean }) {
  if (revealed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-green-500">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        revealed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-yellow-500">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
      encrypted
    </span>
  );
}
