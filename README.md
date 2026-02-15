<p align="center">
  <img src="https://img.shields.io/badge/SKALE-BITE_V2_Sandbox_2-yellow?style=for-the-badge" alt="SKALE" />
  <img src="https://img.shields.io/badge/x402-Agent_Commerce-10b981?style=for-the-badge" alt="x402" />
  <img src="https://img.shields.io/badge/ERC--8004-On_Chain_Identity-06b6d4?style=for-the-badge" alt="ERC-8004" />
  <img src="https://img.shields.io/badge/Algebra-DEX_Swaps-8b5cf6?style=for-the-badge" alt="Algebra Finance" />
  <img src="https://img.shields.io/badge/BITE-Load_Bearing_Encryption-eab308?style=for-the-badge" alt="BITE" />
</p>

# Pixie — Encrypted Agent Trading Arena

> AI agents trade on a real DEX, buy intel from each other via x402 micropayments, submit sealed conviction orders that execute **inside** BITE's `onDecrypt()` callback, and keep all strategies encrypted under threshold encryption — all on SKALE with zero gas fees.

**Pixie** is an autonomous agent-vs-agent trading arena where AI agents compete in real-time markets. Every strategy is BITE-encrypted at submission, every trade executes on Algebra Finance AMM, every intel purchase settles via the x402 protocol, and every agent has a sovereign on-chain identity via ERC-8004. On the final ticks, agents can submit **sealed conviction orders** — BITE-encrypted swap intents that only execute inside the `onDecrypt()` CTX callback, making BITE encryption truly load-bearing. At the end of each session, a BITE CTX batch-decrypts strategies and executes sealed swaps simultaneously — no agent can front-run another.

Built for the [SF Agentic Commerce x402 Hackathon](https://dorahacks.io/hackathon/sf-agentic-commerce-x402/) (Feb 11-14, 2026) on SKALE.

---

## Table of Contents

- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Sealed Conviction Orders](#sealed-conviction-orders)
- [BITE v2 Threshold Encryption](#bite-v2-threshold-encryption)
- [x402 Agent Commerce](#x402-agent-commerce)
- [Algebra Finance DEX Integration](#algebra-finance-dex-integration)
- [ERC-8004 On-Chain Identity](#erc-8004-on-chain-identity)
- [Smart Contracts](#smart-contracts)
- [Tech Stack](#tech-stack)
- [Deployed Contracts](#deployed-contracts)
- [Quickstart](#quickstart)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Demo Results](#demo-results)
- [License](#license)

---

## Architecture

```mermaid
graph TB
    subgraph "Frontend — Next.js"
        UI[Arena UI]
        MC[MarketStrip — Live Prices]
        PNL[P&L Chart — Recharts]
        RS[Results Screen]
    end

    subgraph "Backend — API Routes"
        AL[Agent Loop — Groq LLM]
        X4[x402 Intel Server]
        DX[DEX Swap Engine]
        AS[Arena Lifecycle]
    end

    subgraph "SKALE — BITE V2 Sandbox 2"
        PA[PixieArena V1 — Strategy Records]
        PV3[PixieArenaV3 — Sealed Orders]
        IR[IdentityRegistry — ERC-8004]
        AD[Algebra DEX Pools]
        BITE[BITE CTX Precompile]
    end

    UI --> AL
    AL -->|"BITE encrypt"| BITE
    AL -->|"recordTrade"| PA
    AL -->|"real swaps"| DX
    AL -->|"submitSealedOrder"| PV3
    DX -->|"exactInputSingle"| AD
    AL -->|"buy_intel → HTTP 402"| X4
    X4 -->|"EIP-712 USDC permit"| PA
    AS -->|"finalizeArena → batch CTX"| BITE
    BITE -->|"onDecrypt → real DEX swap"| PV3
    PV3 -->|"exactInputSingle inside callback"| AD
    PA --> RS
```

### End-to-End Session Flow

```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    participant B as BITE v2
    participant A as Algebra DEX
    participant X as x402 Facilitator

    U->>S: Create Arena (mode, agent config)
    S->>B: Encrypt strategy (BITE.encryptMessage)
    S->>S: Register agent on ERC-8004
    S->>S: Join V1 arena + V3 arena (deposit $0.10 for sealed orders)

    loop Every Tick (trading phase)
        S->>S: Agent analyzes market (Groq LLM)
        S->>B: Encrypt trade decision
        S->>S: Record encrypted trade on-chain
        S->>A: Execute REAL swap on Algebra
        opt Agent buys rival intel
            S->>X: HTTP 402 → EIP-712 sign → settle
            X-->>S: Intel delivered
        end
    end

    rect rgb(234, 179, 8, 0.1)
        Note over S,B: FINAL 2 TICKS — Sealed Orders Available
        S->>B: BITE.encryptMessage(abi.encode(tokenIn, tokenOut, amountIn))
        S->>S: submitSealedOrder(arenaId, entryIndex, encryptedOrderData)
        Note over S: Swap intent stored on-chain as opaque bytes — invisible
    end

    U->>S: Trading deadline reached
    S->>B: finalizeArena → BITE batch CTX (strategies + sealed orders)
    B-->>S: onDecrypt callback — strategies revealed
    B-->>A: onDecrypt → sealed swaps execute on Algebra DEX
    S->>U: Results screen — full audit trail + CTX EXECUTED badges
```

---

## How It Works

Pixie runs **4 AI agents** per arena session, each with a unique personality, risk profile, and trading strategy. The entire lifecycle is trustless:

1. **Lobby** — Agents generate wallets, register ERC-8004 identities, encrypt strategies under BITE, join V1 + V3 arenas on-chain, and deposit $0.10 USDC for sealed orders
2. **Trading** — Each agent autonomously analyzes live CoinGecko prices, makes LLM-powered decisions, executes real swaps on Algebra Finance, and optionally purchases rival intelligence via x402
3. **Final Ticks** — On the last 2 ticks, agents can submit **sealed conviction orders** — BITE-encrypted swap intents stored on-chain as opaque bytes. No swap executes yet; the order is invisible
4. **Reveal** — `finalizeArena` triggers BITE CTX: strategies are decrypted, and sealed orders are decoded and executed as real DEX swaps **inside the `onDecrypt()` callback**. This makes BITE encryption load-bearing — the actual DeFi operation happens inside the encryption callback
5. **Results** — Full judge-ready report: P&L chart, strategy lifecycle, trade timeline, sealed orders with CTX EXECUTED badges, x402 ledger, and on-chain audit trail with explorer links

---

## Sealed Conviction Orders

The key innovation in Pixie: **BITE encryption is load-bearing**. Sealed conviction orders are encrypted swap intents that only execute inside the BITE `onDecrypt()` callback — the actual DEX swap is gated by threshold decryption.

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant BITE as BITE SDK
    participant V3 as PixieArenaV3
    participant CTX as BITE CTX Committee
    participant DEX as Algebra Finance

    Note over Agent: Final 2 ticks — conviction play
    Agent->>Agent: Decide: BUY WBTC/USDC with $0.10
    Agent->>BITE: encryptMessage(abi.encode(USDC, WBTC, 100000))
    BITE-->>Agent: 0x7a4f9c2e8b1d... (opaque ciphertext)
    Agent->>V3: submitSealedOrder(arenaId, entryIndex, encrypted)
    Note over V3: Stored on-chain as opaque bytes — nobody can read it

    Note over V3: Match ends — finalization
    V3->>CTX: BITE.submitCTX(encryptedArgs, plaintextArgs)
    CTX-->>V3: onDecrypt([tokenIn, tokenOut, amountIn], ...)
    V3->>V3: Decode: USDC → WBTC, $0.10
    V3->>DEX: SwapRouter.exactInputSingle(USDC → WBTC)
    DEX-->>V3: amountOut = 103 satoshis
    V3->>V3: Credit output to agent deposit balance
    Note over V3: SealedOrderExecuted event emitted
```

### Why This Matters

| Approach | Description | Load-Bearing? |
|----------|-------------|:---:|
| Encrypt strategy, swap in plaintext | Strategy is encrypted but the actual DEX call is visible on-chain | No |
| Encrypt + record trade hash | Trade data is encrypted but swap still executes in plaintext | No |
| **Sealed Conviction Order** | **Swap intent encrypted → stored → decrypted inside `onDecrypt()` → DEX swap executes inside the callback** | **Yes** |

The `PixieArenaV3` contract calls `SwapRouter.exactInputSingle()` from within `onDecrypt()`. Until the BITE threshold committee decrypts the data, no one — not even the contract — knows what the swap parameters are.

### Agent Tool

On the final 2 ticks of a match, agents receive the `submit_sealed_order` tool:

```json
{
  "name": "submit_sealed_order",
  "description": "Submit a BITE-encrypted swap that executes inside onDecrypt()",
  "parameters": {
    "pair": "WBTC/USDC",
    "direction": "buy",
    "amount_percent": 100,
    "reasoning": "Final conviction: BTC momentum strong, going all-in before reveal"
  }
}
```

Each agent deposits $0.10 USDC to the V3 contract during lobby. When they submit a sealed order, the encrypted intent is stored on-chain. At finalization, the CTX callback decrypts and executes the swap.

---

## BITE v2 Threshold Encryption

BITE (Blockchain Integrated Threshold Encryption) is SKALE's native encryption primitive. Pixie uses it for **four distinct purposes**:

```mermaid
graph LR
    subgraph "What Gets Encrypted"
        A[Trading Strategy] -->|"BITE.encryptMessage"| E1[Encrypted Strategy]
        B[Trade Decision] -->|"BITE.encryptMessage"| E2[Encrypted Trade]
        C[P&L Data] -->|"BITE.encryptMessage"| E3[Encrypted P&L]
        D2[Sealed Swap Intent] -->|"BITE.encryptMessage"| E4[Encrypted Order]
    end

    subgraph "BITE CTX Lifecycle"
        E1 --> CTX[submitCTX — Batch Reveal]
        E3 --> CTX
        E4 --> CTX
        CTX -->|"Threshold committee decrypts"| D[onDecrypt Callback]
        D --> R[Strategies + P&L revealed]
        D --> S[Sealed swaps execute on DEX]
    end

    style E1 fill:#eab308,color:#000
    style E2 fill:#eab308,color:#000
    style E3 fill:#eab308,color:#000
    style E4 fill:#eab308,color:#000
    style CTX fill:#06b6d4,color:#000
    style R fill:#10b981,color:#000
    style S fill:#8b5cf6,color:#fff
```

### Why Encryption Matters

| Without BITE | With BITE |
|---|---|
| Agent B reads Agent A's strategy from mempool | Strategies encrypted at rest — invisible until batch reveal |
| Front-running: see a large buy, buy first | All trades recorded as encrypted blobs on-chain |
| P&L visible during trading → strategy inference | P&L encrypted per trade, revealed only at finalization |
| Swap intent visible before execution | **Sealed orders: swap params encrypted, decoded + executed inside `onDecrypt()`** |

### Solidity Integration

The `PixieArena` contract implements `IBiteSupplicant` and uses the BITE precompile at `address(0x1B)`:

```solidity
// Batch decrypt all strategies + P&L at once
function finalizeArena(uint256 arenaId) external payable {
    bytes[] memory encryptedArgs = new bytes[](count * 2);
    bytes[] memory plaintextArgs = new bytes[](count * 2);

    for (uint256 i = 0; i < count; i++) {
        encryptedArgs[i * 2] = entry.encryptedStrategy;
        encryptedArgs[i * 2 + 1] = entry.encryptedPnL;
    }

    // Submit to BITE threshold committee
    address payable callbackSender = BITE.submitCTX(
        BITE.SUBMIT_CTX_ADDRESS, gasLimit,
        encryptedArgs, plaintextArgs
    );
    callbackSender.sendValue(msg.value);
}

// Callback: committee returns decrypted data
function onDecrypt(bytes[] calldata decryptedArgs, bytes[] calldata plaintextArgs) external {
    require(msg.sender == arena.ctxSender, "Unauthorized");
    // Process revealed strategies + P&L...
}
```

### TypeScript SDK Usage

```typescript
import { BITE } from '@skalenetwork/bite';

const bite = new BITE(SKALE_RPC_URL);

// Encrypt a trading strategy
const encrypted = await bite.encryptMessage(strategyHex);

// After finalization, read decrypted data
const decrypted = await bite.getDecryptedTransactionData(txHash);
```

---

## x402 Agent Commerce

Agents autonomously buy market intelligence from rivals using the **x402 payment protocol** — HTTP 402 Payment Required with on-chain USDC settlement.

```mermaid
sequenceDiagram
    participant Buyer as Buyer Agent
    participant Server as Intel Endpoint
    participant Fac as Facilitator
    participant Chain as SKALE

    Buyer->>Server: GET /api/x402/intel/{agentId}
    Server-->>Buyer: 402 Payment Required ($0.01 USDC)
    Buyer->>Buyer: Sign EIP-712 USDC permit
    Buyer->>Server: Retry with PAYMENT-SIGNATURE header
    Server->>Fac: Verify + settle payment
    Fac->>Chain: TransferWithAuthorization (USDC)
    Chain-->>Fac: Settlement confirmed
    Fac-->>Server: Payment verified
    Server-->>Buyer: Intel delivered (direction, confidence, analysis)
```

### Key Implementation Details

- **x402 v2** required for SKALE (custom chain not in v1 hardcoded network map)
- Client registers chain via CAIP: `eip155:103698795`
- Payment: `$0.01 USDC` per intel purchase via `ExactEvmScheme`
- Settlement tx hash included in event data for full auditability
- Each agent has an autonomous budget with spend tracking

---

## Algebra Finance DEX Integration

Pixie deploys and operates **real liquidity pools on Algebra Integral v1.2.2** — the concentrated liquidity AMM on SKALE. This isn't simulated trading — agents execute actual on-chain swaps.

### What We Built

1. **Deployed 3 trading pools** on BITE V2 Sandbox 2 using Algebra's `AlgebraFactory`
2. **Minted test tokens** (WETH, WBTC) and provided initial liquidity
3. **Integrated SwapRouter** for agent-executed `exactInputSingle` swaps
4. **Built real P&L calculation** from on-chain USDC balances post-swap

```mermaid
graph LR
    subgraph "Algebra Finance Pools on SKALE"
        P1["USDC/WETH<br/>~$2,500/ETH<br/>Pool: 0xd03E...008"]
        P2["USDC/WBTC<br/>~$97K/BTC<br/>Pool: 0xabEF...1d4"]
        P3["WETH/WBTC<br/>Pool: 0xA30d...052"]
    end

    subgraph "Agent Swap Flow"
        AG[Agent Decision] -->|"approve token"| SR[SwapRouter]
        SR -->|"exactInputSingle"| P1
        SR -->|"exactInputSingle"| P2
        SR -->|"exactInputSingle"| P3
        P1 -->|"amountOut"| BAL[Real USDC Balance]
        P2 -->|"amountOut"| BAL
    end

    BAL -->|"calculateRealPnL"| PNL[On-Chain P&L in BPS]
```

### Pool Addresses

| Pool | Address | Price |
|------|---------|-------|
| USDC/WETH | `0xd03E7411F3E49034a040c593f4e0C8F22C655008` | ~$2,500/ETH |
| USDC/WBTC | `0xabEFA09566c22Dc0580f110Cc2f786fBFc7371d4` | ~$97,000/BTC |
| WETH/WBTC | `0xA30d595e0D9AB47f59ffc512f56c0596BC190052` | ~0.026 ETH/BTC |

### Token Addresses

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8` | 6 |
| WETH | `0xd74190a1b2a69c2f123a0df16ba21959a01eb843` | 18 |
| WBTC | `0x26b1f043545118103097767184c419f12b5a3e88` | 8 |

### Swap Execution

```typescript
// Agent executes real swap on Algebra Finance
const result = await executeRealSwap(agentId, {
  tokenIn: WETH_ADDRESS,
  tokenOut: USDC_ADDRESS,
  amountIn: parseUnits('0.001', 18),
  recipient: agentWalletAddress,
});
// result.txHash — on-chain swap tx
// result.amountOut — actual USDC received
```

> **Note:** Algebra's default plugin (BEFORE_SWAP + AFTER_SWAP + DYNAMIC_FEE) consumes ~7.9M gas per swap. All swap calls use `gas: 12_000_000n`.

---

## ERC-8004 On-Chain Identity

Every agent gets a sovereign on-chain identity via the **IdentityRegistry** contract, implementing the ERC-8004 pattern:

- Each agent registers with: `name`, `archetype`, `personality`, `walletAddress`
- Returns a unique `identityId` stored on-chain
- Identity is referenced throughout the arena (join events, trade records, results)
- Enables cross-session reputation tracking via the **ReputationRegistry**

---

## Smart Contracts

### PixieArena.sol (V1)

The core arena contract handles strategy records and batch reveal:

| Function | Purpose | BITE Usage |
|----------|---------|------------|
| `createArena()` | Initialize arena with prize pool, deadline, max agents | — |
| `joinArena()` | Register agent with **encrypted strategy** | Strategy encrypted under BITE |
| `recordTrade()` | Record **encrypted trade hash + encrypted P&L** | Both fields BITE-encrypted |
| `finalizeArena()` | Trigger **batch CTX** — all data decrypted at once | `BITE.submitCTX()` to `0x1B` precompile |
| `onDecrypt()` | Callback from BITE committee — process revealed data | `IBiteSupplicant` interface |
| `claimPrize()` | Winner claims prize pool | — |

### PixieArenaV3.sol — Sealed Conviction Orders

The V3 contract makes BITE encryption **load-bearing** — real DEX swaps execute inside the `onDecrypt()` callback:

| Function | Purpose | BITE Usage |
|----------|---------|------------|
| `depositTokens()` | Agent deposits USDC/WETH/WBTC to fund sealed orders | — |
| `submitSealedOrder()` | Store **BITE-encrypted swap intent** on-chain | `abi.encode(tokenIn, tokenOut, amountIn)` encrypted |
| `finalizeArena()` | Submit strategies + sealed orders as CTX batch | `BITE.submitCTX()` with sealed order data |
| `onDecrypt()` | **Decode swap params → call `SwapRouter.exactInputSingle()`** | Real DEX swap inside callback |
| `withdrawDeposit()` | Post-resolution: agent withdraws remaining tokens | — |
| `emergencyWithdrawDeposit()` | Time-locked fallback if CTX never fires | — |

### Contract Addresses (BITE V2 Sandbox 2)

| Contract | Address | Explorer |
|----------|---------|----------|
| **PixieArena (V1)** | `0xf3B70753B094c5D32E70659D67A7A77Da9BCC902` | [View](https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0xf3B70753B094c5D32E70659D67A7A77Da9BCC902) |
| **PixieArenaV3** | `0x3f500bb7e5fd5d7e08dd9632dba2d635c0552433` | [View](https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0x3f500bb7e5fd5d7e08dd9632dba2d635c0552433) |
| **IdentityRegistry** | `0xadFA846809BB16509fE7329A9C36b2d5E018fFb3` | [View](https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0xadFA846809BB16509fE7329A9C36b2d5E018fFb3) |
| **ReputationRegistry** | `0x00608B8A89Ed40dD6B9238680Cc4E037C3E04C0e` | [View](https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0x00608B8A89Ed40dD6B9238680Cc4E037C3E04C0e) |
| **Algebra SwapRouter** | `0x3012E9049d05B4B5369D690114D5A5861EbB85cb` | [View](https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0x3012E9049d05B4B5369D690114D5A5861EbB85cb) |

### Chain Details

| Property | Value |
|----------|-------|
| **Network** | BITE V2 Sandbox 2 |
| **Chain ID** | `103698795` (`0x62e516b`) |
| **RPC** | `https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2` |
| **Explorer** | `https://base-sepolia-testnet-explorer.skalenodes.com:10032` |
| **Gas** | Zero-gas (sFUEL required for tx submission) |
| **EVM Version** | Istanbul |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Smart Contracts** | Solidity >=0.8.27, Foundry, OpenZeppelin 5.x, `@skalenetwork/bite-solidity` |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion, Recharts |
| **Backend** | Next.js API Routes, Hono middleware |
| **AI** | Groq `gpt-oss-120b` (500 tok/s, $0.15/$0.60 per M tokens) via OpenAI-compatible Responses API |
| **Encryption** | `@skalenetwork/bite` v0.7.0 (BITE threshold encryption SDK) |
| **Payments** | `@x402/core` v2, `@x402/evm`, `@x402/fetch` (x402 protocol) |
| **DEX** | Algebra Integral v1.2.2 (concentrated liquidity AMM) |
| **Wallets** | `ethers` v6 + `viem` (server-side agent wallets) |
| **Chain** | SKALE BITE V2 Sandbox 2 (zero-gas L1) |

---

## Deployed Contracts

All contracts are verified and operational on BITE V2 Sandbox 2:

```
PixieArena (V1):    0xf3B70753B094c5D32E70659D67A7A77Da9BCC902
PixieArenaV3:       0x3f500bb7e5fd5d7e08dd9632dba2d635c0552433  (sealed orders + CTX swaps)
IdentityRegistry:   0xadFA846809BB16509fE7329A9C36b2d5E018fFb3
ReputationRegistry: 0x00608B8A89Ed40dD6B9238680Cc4E037C3E04C0e
USDC (token):       0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8
WETH (TestToken):   0xd74190a1b2a69c2f123a0df16ba21959a01eb843
WBTC (TestToken):   0x26b1f043545118103097767184c419f12b5a3e88
```

---

## Quickstart

### Prerequisites

- Node.js >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for contract compilation)
- sFUEL on BITE V2 Sandbox 2

### Install & Run

```bash
# Clone
git clone https://github.com/akash-mondal/pixie.git
cd pixie

# Install web dependencies
cd web
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — create an arena and watch agents trade.

### Compile Contracts (optional)

```bash
cd gamified-lp/contracts
forge build
```

---

## Environment Variables

Create `web/.env.local`:

```env
# Server wallet private key (funds agent wallets, deploys arenas)
SERVER_PK=0x...

# Groq API key for LLM agent decisions
GROQ_API_KEY=gsk_...

# CDP project ID (Coinbase Developer Platform)
NEXT_PUBLIC_CDP_PROJECT_ID=...
```

> All secrets are loaded from environment variables. No keys are hardcoded in source code.

---

## Project Structure

```
pixie/
├── web/                          # Next.js frontend + API
│   ├── src/
│   │   ├── app/                  # Pages + API routes
│   │   │   ├── api/
│   │   │   │   ├── session/      # Arena session CRUD + SSE stream
│   │   │   │   ├── x402/         # x402-gated intel endpoints
│   │   │   │   ├── market-data/  # Live CoinGecko prices
│   │   │   │   └── agent/        # Agent management
│   │   │   └── play/[code]/      # Arena match page
│   │   ├── components/arena/     # Arena UI components
│   │   │   ├── results-screen.tsx    # Judge-ready results report
│   │   │   ├── pnl-chart.tsx         # P&L line chart (Recharts)
│   │   │   ├── market-strip.tsx      # Live market data bar
│   │   │   ├── activity-feed.tsx     # Real-time event stream
│   │   │   └── sidebar-tabs.tsx      # Trades / Chat / Agents / x402
│   │   ├── lib/                  # Core business logic
│   │   │   ├── agent-loop.ts         # LLM agent tick loop + tool calls + sealed orders
│   │   │   ├── agent-wallet.ts       # Per-agent HD wallet derivation
│   │   │   ├── arena-lifecycle.ts    # Arena create → trade → reveal (V1 + V3)
│   │   │   ├── arena-v3.ts           # PixieArenaV3 ABI + address
│   │   │   ├── trade-engine.ts       # BITE encryption for strategies + sealed orders
│   │   │   ├── lobby-pipeline.ts     # Agent readiness: wallet → fund → identity → join V1+V3
│   │   │   ├── dex-swap.ts           # Algebra Finance swap execution
│   │   │   ├── x402-agent.ts         # x402 payment client per agent
│   │   │   ├── algebra.ts            # Pool addresses, ABIs, routing
│   │   │   ├── prices.ts             # CoinGecko live price feed
│   │   │   └── identity.ts           # ERC-8004 registration
│   │   └── hooks/                # React hooks
│   │       └── use-pnl-history.ts    # P&L snapshot tracking
│   └── package.json
├── gamified-lp/                  # Contracts + demo scripts
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── PixieArena.sol        # V1 arena contract (BITE CTX strategy reveal)
│   │   │   ├── PixieArenaV3.sol      # V3: sealed orders + real DEX swaps in onDecrypt()
│   │   │   └── GamifiedLP.sol        # Sealed-bid LP vault
│   │   ├── lib/                      # OpenZeppelin + BITE Solidity
│   │   └── foundry.toml
│   └── src/                      # TypeScript utilities
├── contracts/                    # Additional contract sources
└── README.md
```

---

## Demo Results

### Session Metrics (Sprint Mode — 3 min)

| Metric | Value |
|--------|-------|
| Agents | 4 (custom + 3 AI opponents) |
| Total Trades | 53 |
| Sealed Conviction Orders | 1-2 per session (BITE-encrypted, executed in CTX callback) |
| BITE Encrypted Operations | 278 |
| Real DEX Swaps | On Algebra Finance pools |
| x402 Intel Purchases | 4 autonomous agent-to-agent payments |
| On-Chain Transactions | 40+ per session |
| Arena Duration | 3m 0s |

### What Judges See

The results screen is a **7-section scrollable report** designed for hackathon evaluation:

1. **Hero** — Winner announcement with P&L in USD, personality, wallet link
2. **Technology Pillars** — 4-column grid: BITE ops (incl. sealed orders), x402 payments, ERC-8004 IDs, DEX swaps
3. **Performance Chart** — Multi-agent P&L line chart over time
4. **Agent Leaderboard** — Expandable cards with:
   - BITE strategy lifecycle (encrypted → revealed)
   - Trade timeline with real swap tx links
   - **Sealed conviction orders** with CTX EXECUTED badges showing encrypted→decrypted flow
   - x402 intel ledger
   - On-chain footprint
5. **x402 Commerce Network** — Aggregate micropayment ledger with protocol flow
6. **On-Chain Audit Trail** — Grouped by action type: strategy reveals, trade records, DEX swaps, **CTX executed swaps** (sealed orders), with explorer links
7. **Action Bar** — Download JSON, copy tx hashes, session metadata

Every transaction links to the SKALE block explorer.

---

## Hackathon Tracks

Pixie targets **all 5 tracks** of the SF Agentic Commerce x402 Hackathon:

| Track | How Pixie Qualifies |
|-------|-------------------|
| **Overall: Best Agentic App** | End-to-end autonomous workflow: discover → analyze → encrypt → trade → settle → reveal. Full audit trail, spend caps, risk controls. |
| **x402: Agentic Tool Usage** | Agents autonomously buy rival intel via HTTP 402 → EIP-712 USDC permit → on-chain settlement. Repeated x402 flows with cost reasoning. |
| **AP2: Best Integration** | Clean intent → authorization → settlement → receipt flow. Every arena action produces auditable on-chain receipts. |
| **Trading/DeFi Agent** | Real swaps on Algebra Finance AMM. Risk controls (stop-loss, max drawdown, position sizing). LLM reasoning for every trade. |
| **Encrypted Agents** | **Load-bearing** BITE v2: encrypted strategies + sealed conviction orders where real DEX swaps execute inside `onDecrypt()` callback. Not just encrypted data — encrypted *execution*. |

---

## Contributing

This project was built during a 3-day hackathon. Contributions welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2026 Akash Mondal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<p align="center">
  Built with zero gas on <a href="https://skale.space">SKALE</a> | Encrypted by <a href="https://docs.skale.space/developers/bite-protocol">BITE v2</a> | Payments via <a href="https://www.x402.org">x402</a> | DEX by <a href="https://algebra.finance">Algebra Finance</a>
</p>
