// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/// @title PixieArena — Encrypted Agent Trading Arena with BITE CTX Batch Reveal
/// @notice Agents join arenas with encrypted strategies, execute BITE-encrypted trades,
///         and compete on P&L. A batch CTX reveals all strategies + results simultaneously.
contract PixieArena is IBiteSupplicant {
    using Address for address payable;

    struct Arena {
        address creator;
        uint256 entryFee;
        uint256 prizePool;
        uint256 maxAgents;
        uint256 deadline;
        uint256 entryCount;
        bool resolved;
        address ctxSender;
        uint256 totalPnL; // sum of absolute PnL for ranking
    }

    struct Entry {
        address owner;
        uint256 agentId;
        bytes encryptedStrategy;
        bytes encryptedPnL;
        int256 revealedPnL;
        uint256 tradeCount;
        bool revealed;
        bool claimed;
    }

    struct TradeRecord {
        bytes encryptedTxHash;
        bytes encryptedPnL;
        uint256 timestamp;
    }

    IERC20 public immutable token;
    uint256 public arenaCount;

    mapping(uint256 => Arena) public arenas;
    mapping(uint256 => mapping(uint256 => Entry)) public entries;
    mapping(uint256 => mapping(uint256 => TradeRecord[])) public tradeLogs;

    // --- Events ---
    event ArenaCreated(uint256 indexed arenaId, address creator, uint256 entryFee, uint256 maxAgents, uint256 deadline, uint256 prizePool);
    event AgentJoined(uint256 indexed arenaId, address owner, uint256 agentId, uint256 entryIndex);
    event TradeRecorded(uint256 indexed arenaId, uint256 entryIndex, uint256 tradeIndex);
    event ArenaFinalized(uint256 indexed arenaId, uint256 entryCount);
    event StrategiesRevealed(uint256 indexed arenaId, uint256 count);
    event PrizeClaimed(uint256 indexed arenaId, uint256 entryIndex, address owner, uint256 prize);

    constructor(address _token) {
        token = IERC20(_token);
    }

    /// @notice Create a new trading arena
    function createArena(
        uint256 entryFee,
        uint256 maxAgents,
        uint256 duration,
        uint256 prizeAmount
    ) external returns (uint256 arenaId) {
        require(maxAgents >= 2, "Need at least 2 agents");
        require(duration > 0, "Duration must be > 0");
        require(prizeAmount > 0, "Prize must be > 0");

        // Transfer prize from creator
        require(token.transferFrom(msg.sender, address(this), prizeAmount), "Prize transfer failed");

        arenaId = arenaCount++;
        Arena storage arena = arenas[arenaId];
        arena.creator = msg.sender;
        arena.entryFee = entryFee;
        arena.prizePool = prizeAmount;
        arena.maxAgents = maxAgents;
        arena.deadline = block.timestamp + duration;

        emit ArenaCreated(arenaId, msg.sender, entryFee, maxAgents, arena.deadline, prizeAmount);
    }

    /// @notice Join an arena with an agent and encrypted strategy
    function joinArena(
        uint256 arenaId,
        uint256 agentId,
        bytes calldata encryptedStrategy
    ) external returns (uint256 entryIndex) {
        Arena storage arena = arenas[arenaId];
        require(arena.creator != address(0), "Arena does not exist");
        require(block.timestamp < arena.deadline, "Arena closed");
        require(arena.entryCount < arena.maxAgents, "Arena full");
        require(!arena.resolved, "Already resolved");

        // Collect entry fee
        if (arena.entryFee > 0) {
            require(token.transferFrom(msg.sender, address(this), arena.entryFee), "Fee transfer failed");
            arena.prizePool += arena.entryFee;
        }

        entryIndex = arena.entryCount;
        Entry storage entry = entries[arenaId][entryIndex];
        entry.owner = msg.sender;
        entry.agentId = agentId;
        entry.encryptedStrategy = encryptedStrategy;

        arena.entryCount++;

        emit AgentJoined(arenaId, msg.sender, agentId, entryIndex);
    }

    /// @notice Record an encrypted trade for an agent in an arena
    function recordTrade(
        uint256 arenaId,
        uint256 entryIndex,
        bytes calldata encryptedTxHash,
        bytes calldata encryptedPnL
    ) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];
        require(entry.owner == msg.sender, "Not your entry");
        require(!arena.resolved, "Already resolved");

        tradeLogs[arenaId][entryIndex].push(TradeRecord({
            encryptedTxHash: encryptedTxHash,
            encryptedPnL: encryptedPnL,
            timestamp: block.timestamp
        }));

        entry.tradeCount++;
        entry.encryptedPnL = encryptedPnL; // latest cumulative P&L

        emit TradeRecorded(arenaId, entryIndex, entry.tradeCount - 1);
    }

    /// @notice Trigger batch CTX reveal — decrypts all strategies + P&L at once
    function finalizeArena(uint256 arenaId) external payable {
        Arena storage arena = arenas[arenaId];
        require(!arena.resolved, "Already resolved");
        require(arena.entryCount > 0, "No entries");
        require(
            block.timestamp >= arena.deadline || arena.entryCount >= arena.maxAgents,
            "Arena not ready"
        );

        // Collect encrypted strategies + P&L for batch decryption
        uint256 count = arena.entryCount;
        bytes[] memory encryptedArgs = new bytes[](count * 2);
        bytes[] memory plaintextArgs = new bytes[](count * 2);

        for (uint256 i = 0; i < count; i++) {
            Entry storage entry = entries[arenaId][i];
            // Strategy
            encryptedArgs[i * 2] = entry.encryptedStrategy;
            plaintextArgs[i * 2] = abi.encode(arenaId, i, "strategy");
            // P&L
            encryptedArgs[i * 2 + 1] = entry.encryptedPnL;
            plaintextArgs[i * 2 + 1] = abi.encode(arenaId, i, "pnl");
        }

        // Submit batch CTX
        uint256 gasLimit = msg.value / tx.gasprice;
        address payable callbackSender = BITE.submitCTX(
            BITE.SUBMIT_CTX_ADDRESS,
            gasLimit,
            encryptedArgs,
            plaintextArgs
        );

        arena.ctxSender = callbackSender;
        callbackSender.sendValue(msg.value);

        emit ArenaFinalized(arenaId, count);
    }

    /// @notice BITE CTX callback — reveals all strategies + P&L simultaneously
    function onDecrypt(
        bytes[] calldata decryptedArgs,
        bytes[] calldata plaintextArgs
    ) external override {
        // Decode first plaintext to get arenaId
        (uint256 arenaId,,) = abi.decode(plaintextArgs[0], (uint256, uint256, string));
        Arena storage arena = arenas[arenaId];

        require(msg.sender == arena.ctxSender, "Unauthorized");
        require(!arena.resolved, "Already resolved");

        // Process decrypted data
        for (uint256 i = 0; i < decryptedArgs.length; i++) {
            (uint256 aId, uint256 entryIndex, string memory dataType) = abi.decode(
                plaintextArgs[i],
                (uint256, uint256, string)
            );
            require(aId == arenaId, "Arena mismatch");

            Entry storage entry = entries[arenaId][entryIndex];

            if (keccak256(bytes(dataType)) == keccak256(bytes("pnl"))) {
                // Decode P&L (basis points, can be negative)
                int256 pnl = abi.decode(decryptedArgs[i], (int256));
                entry.revealedPnL = pnl;
            }

            entry.revealed = true;
        }

        arena.resolved = true;
        emit StrategiesRevealed(arenaId, arena.entryCount);
    }

    /// @notice Claim prize — top performer gets most
    function claimPrize(uint256 arenaId, uint256 entryIndex) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];

        require(arena.resolved, "Not resolved");
        require(entry.owner == msg.sender, "Not your entry");
        require(!entry.claimed, "Already claimed");
        require(entry.revealed, "Not revealed");

        entry.claimed = true;

        // Simple prize: split equally for now (ranking can be computed off-chain)
        uint256 prize = arena.prizePool / arena.entryCount;
        require(token.transfer(msg.sender, prize), "Transfer failed");

        emit PrizeClaimed(arenaId, entryIndex, msg.sender, prize);
    }

    // --- View functions ---

    function getArena(uint256 arenaId) external view returns (
        address creator, uint256 entryFee, uint256 prizePool,
        uint256 maxAgents, uint256 deadline, uint256 entryCount,
        bool resolved
    ) {
        Arena storage a = arenas[arenaId];
        return (a.creator, a.entryFee, a.prizePool, a.maxAgents,
                a.deadline, a.entryCount, a.resolved);
    }

    function getEntry(uint256 arenaId, uint256 index) external view returns (
        address owner, uint256 agentId, uint256 tradeCount,
        int256 revealedPnL, bool revealed, bool claimed
    ) {
        Entry storage e = entries[arenaId][index];
        return (e.owner, e.agentId, e.tradeCount, e.revealedPnL,
                e.revealed, e.claimed);
    }

    function getTradeCount(uint256 arenaId, uint256 entryIndex) external view returns (uint256) {
        return tradeLogs[arenaId][entryIndex].length;
    }
}
