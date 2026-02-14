'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { useIsSignedIn, useIsInitialized, useEvmAddress, useSignOut } from '@coinbase/cdp-hooks';
import { AuthButton } from '@coinbase/cdp-react';

export function Header() {
  const { usdcBalance } = useWallet();
  const { isSignedIn } = useIsSignedIn();
  const { isInitialized } = useIsInitialized();
  const { evmAddress } = useEvmAddress();
  const { signOut } = useSignOut();
  const pathname = usePathname();
  const [showAccount, setShowAccount] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAccount(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#1a1a1a]/50">
      <div className="max-w-[1400px] mx-auto px-5 h-14 grid grid-cols-3 items-center">
        {/* Left — Logo */}
        <Link href="/" className="font-pixel text-[16px] text-[#ededed] tracking-wider justify-self-start">
          PIXIE
        </Link>

        {/* Center — Nav (always centered) */}
        <nav className="hidden sm:flex items-center gap-1 bg-[#111] border border-[#1a1a1a] rounded-full px-1 py-1 justify-self-center">
          <NavLink href="/play" active={isActive('/play')}>play</NavLink>
          <NavLink href="/agents" active={isActive('/agents')}>agents</NavLink>
        </nav>

        {/* Right — Account */}
        <div className="flex items-center gap-3 justify-self-end">
          {!isInitialized ? (
            <div className="w-20 h-8 rounded-full bg-[#1a1a1a] animate-pulse" />
          ) : isSignedIn ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowAccount(!showAccount)}
                className="flex items-center gap-2 px-3 py-1.5 border border-[#1a1a1a] rounded-full hover:border-[#333] transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                {usdcBalance !== null && (
                  <span className="text-[11px] text-[#ededed] font-mono">
                    ${parseFloat(usdcBalance).toFixed(2)}
                  </span>
                )}
                <span className="text-[11px] text-[#888] font-mono">
                  {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : 'connected'}
                </span>
              </button>

              {showAccount && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#111] border border-[#1a1a1a] rounded-lg p-4 shadow-xl">
                  {evmAddress && (
                    <div className="mb-3">
                      <div className="text-[9px] text-[#444] font-mono tracking-widest mb-1">WALLET</div>
                      <div className="text-[11px] text-[#ededed] font-mono break-all leading-relaxed">
                        {evmAddress}
                      </div>
                    </div>
                  )}
                  {usdcBalance !== null && (
                    <div className="mb-3">
                      <div className="text-[9px] text-[#444] font-mono tracking-widest mb-1">USDC BALANCE</div>
                      <div className="text-[16px] text-[#ededed] font-mono">
                        ${parseFloat(usdcBalance).toFixed(2)}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { signOut(); setShowAccount(false); }}
                    className="w-full py-2 text-[11px] font-mono text-[#666] border border-[#1a1a1a] rounded-lg hover:border-[#333] hover:text-[#999] transition-colors"
                  >
                    sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <AuthButton />
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-full text-[13px] transition-colors ${
        active
          ? 'bg-[#ededed] text-[#0a0a0a] font-medium'
          : 'text-[#555] hover:text-[#ededed]'
      }`}
    >
      {children}
    </Link>
  );
}
