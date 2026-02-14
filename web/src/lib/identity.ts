// IdentityRegistry — real on-chain agent identity (ERC-8004 / ERC-721)

import { parseAbi, type Address } from 'viem';
import { publicClient } from './contract';

export const IDENTITY_REGISTRY = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY || '0xadFA846809BB16509fE7329A9C36b2d5E018fFb3') as Address;
export const REPUTATION_REGISTRY = (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY || '0x00608B8A89Ed40dD6B9238680Cc4E037C3E04C0e') as Address;

export const IDENTITY_ABI = parseAbi([
  'function register() external returns (uint256)',
  'function registerWithURI(string agentURI) external returns (uint256)',
  'function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function agentURI(uint256 agentId) external view returns (string)',
  'function agentCount() external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event MetadataSet(uint256 indexed agentId, string metadataKey, bytes metadataValue)',
]);

export const REPUTATION_ABI = parseAbi([
  'function submitScore(uint256 identityId, uint256 score, bytes context) external',
  'function getScore(uint256 identityId) external view returns (uint256 totalScore, uint256 submissions)',
]);

export interface AgentIdentity {
  id: number;
  owner: string;
  uri: string;
}

export async function getAgentCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'agentCount',
  });
  return Number(count);
}

export async function getAgentWallet(agentId: number): Promise<string> {
  return await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'getAgentWallet',
    args: [BigInt(agentId)],
  });
}

export async function getAgentURI(agentId: number): Promise<string> {
  return await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'agentURI',
    args: [BigInt(agentId)],
  });
}

export async function getAgentMetadata(agentId: number, key: string): Promise<string> {
  return await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'getMetadata',
    args: [BigInt(agentId), key],
  });
}

export async function getOwnerOf(agentId: number): Promise<string> {
  return await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'ownerOf',
    args: [BigInt(agentId)],
  });
}
