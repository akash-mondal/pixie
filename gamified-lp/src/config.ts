// Chain configuration and contract ABIs

export const CHAIN = {
  rpc: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox-2',
  chainId: 103698795,
  name: 'BITE V2 Sandbox 2',
};

export const CONTRACTS = {
  usdc: '0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8',
  gamifiedLP: '', // set after deploy
  algebraFactory: '0x10253594A832f967994b44f33411940533302ACb',
};

export const GAMIFIED_LP_ABI = [
  'function createPool(uint256 deadline, uint256 minDepositors, uint256 maxDepositors, uint256 minDeposit, uint256 maxDeposit, uint256 rewardAmount, uint256 gracePeriod) external returns (uint256)',
  'function deposit(uint256 poolId, uint256 amount, bytes encryptedStrategy) external',
  'function resolve(uint256 poolId) external payable',
  'function claimReward(uint256 poolId, uint256 depositIndex) external',
  'function emergencyWithdraw(uint256 poolId, uint256 depositIndex) external',
  'function getPool(uint256 poolId) external view returns (address creator, uint256 depositDeadline, uint256 minDepositors, uint256 maxDepositors, uint256 depositCount, uint256 totalDeposited, uint256 rewardAmount, bool resolved, uint256 totalWeight)',
  'function getDeposit(uint256 poolId, uint256 index) external view returns (address depositor, uint256 amount, int24 tickLower, int24 tickUpper, uint256 lockDays, bool revealed, bool claimed)',
  'function poolCount() external view returns (uint256)',
  'event PoolCreated(uint256 indexed poolId, address creator, uint256 deadline, uint256 minDepositors, uint256 rewardAmount)',
  'event DepositMade(uint256 indexed poolId, address depositor, uint256 amount, uint256 index)',
  'event ResolutionTriggered(uint256 indexed poolId, uint256 depositCount, string triggerType)',
  'event StrategiesRevealed(uint256 indexed poolId, uint256 count, uint256 totalWeight)',
  'event RewardClaimed(uint256 indexed poolId, address depositor, uint256 depositAmount, uint256 reward)',
  'event EmergencyWithdraw(uint256 indexed poolId, address depositor, uint256 amount, string reason)',
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

export function parseUsdc(amount: number | string): bigint {
  const str = String(amount);
  const parts = str.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * 1000000n + BigInt(frac);
}

export function formatUsdc(amount: bigint): string {
  const str = amount.toString().padStart(7, '0');
  const whole = str.slice(0, -6) || '0';
  const frac = str.slice(-6).replace(/0+$/, '') || '0';
  return `${whole}.${frac}`;
}
