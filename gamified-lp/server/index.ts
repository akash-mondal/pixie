// Pixie API Server — Hono on Node.js

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

import { initPoolManager, getContractAddress } from './lib/pool-manager.js';
import { poolRoutes } from './routes/pools.js';
import { agentRoutes } from './routes/agents.js';
import { resolveRoutes } from './routes/resolve.js';
import { sfuelRoutes } from './routes/sfuel.js';
import { marketRoutes } from './routes/market.js';

// Initialize chain connection + wallets
initPoolManager();

const app = new Hono();

// Middleware
app.use('*', cors({ origin: ['http://localhost:3000', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3002'], credentials: true }));
app.use('*', logger());

// x402 payment middleware
const USE_X402 = process.env.USE_X402 === 'true';
if (USE_X402) {
  const facilitator = new HTTPFacilitatorClient({ url: 'https://gateway.kobaru.io' });
  const resourceServer = new x402ResourceServer(facilitator)
    .register('eip155:103698795', new ExactEvmScheme());

  const payTo = process.env.BUYER_ADDRESS!;

  app.use(
    paymentMiddleware(
      {
        'GET /api/market/pool-data': {
          accepts: {
            scheme: 'exact',
            price: '$0.01',
            network: 'eip155:103698795',
            payTo,
          },
          description: 'Premium Algebra pool analytics',
        },
        'POST /api/agents/run': {
          accepts: {
            scheme: 'exact',
            price: '$0.02',
            network: 'eip155:103698795',
            payTo,
          },
          description: 'Deploy AI agent to LP pool',
        },
      },
      resourceServer,
      { appName: 'Pixie', testnet: true },
    ),
  );
  console.log('  x402 payment middleware enabled');
}

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now(), x402: USE_X402 }));

// Config for frontend
app.get('/api/config', (c) =>
  c.json({
    chainId: Number(process.env.CHAIN_ID),
    rpcUrl: process.env.RPC_URL,
    contractAddress: getContractAddress(),
    usdcAddress: process.env.USDC_ADDRESS,
    explorer: 'https://bite-v2-sandbox-2.explorer.skalenodes.com',
    x402Enabled: USE_X402,
  }),
);

// Mount routes
app.route('/api/pools', poolRoutes);
app.route('/api/pools', resolveRoutes);  // POST /api/pools/:id/resolve
app.route('/api/agents', agentRoutes);
app.route('/api/market', marketRoutes);
app.route('/api/sfuel', sfuelRoutes);

const port = Number(process.env.PORT || 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`\n  Pixie API running on http://localhost:${info.port}`);
  console.log(`  Contract: ${getContractAddress()}`);
  console.log(`  Chain: BITE V2 Sandbox 2 (${process.env.CHAIN_ID})\n`);
});
