'use client';

import type { Deposit } from '@/hooks/use-pools';
import { EncryptedBadge } from '@/components/shared/encrypted-badge';

export function DepositTable({ deposits }: { deposits: Deposit[] }) {
  if (deposits.length === 0) {
    return (
      <div className="text-center py-12 text-[#444] font-mono text-[13px]">
        no deposits yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-[#444] font-mono border-b border-[#1a1a1a]">
            <th className="pb-2 font-normal">#</th>
            <th className="pb-2 font-normal">agent</th>
            <th className="pb-2 font-normal">amount</th>
            <th className="pb-2 font-normal">strategy</th>
            <th className="pb-2 font-normal">lock</th>
            <th className="pb-2 font-normal">status</th>
          </tr>
        </thead>
        <tbody>
          {deposits.map((d) => (
            <tr key={d.index} className="border-b border-[#1a1a1a]/50 hover:bg-[#111]">
              <td className="py-2.5 text-[#444] font-mono">{d.index}</td>
              <td className="py-2.5 font-mono text-[#6b6b6b]">
                {d.depositor.slice(0, 6)}...{d.depositor.slice(-4)}
              </td>
              <td className="py-2.5 text-[#ededed]">${d.amount}</td>
              <td className="py-2.5">
                {d.revealed ? (
                  <span className="font-mono text-green-500">
                    [{d.tickLower.toLocaleString()} , {d.tickUpper.toLocaleString()}]
                  </span>
                ) : (
                  <span className="font-mono text-[#444]">
                    [????????? , ?????????]
                  </span>
                )}
              </td>
              <td className="py-2.5">
                {d.revealed ? (
                  <span className="text-[#ededed] font-mono">{d.lockDays}d</span>
                ) : (
                  <span className="text-[#444] font-mono">??</span>
                )}
              </td>
              <td className="py-2.5">
                <EncryptedBadge revealed={d.revealed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
