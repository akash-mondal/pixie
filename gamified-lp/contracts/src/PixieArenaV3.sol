// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

// --- Algebra SwapRouter interface ---
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    address deployer;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 limitSqrtPrice;
}

interface ISwapRouter {
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title PixieArenaV3 — Encrypted Agent Trading Arena with Sealed Conviction Orders
/// @notice Agents join arenas with encrypted strategies, trade in real-time, and submit
///         BITE-encrypted sealed orders that execute REAL Algebra DEX swaps inside the
///         onDecrypt() CTX callback. Load-bearing threshold encryption for DeFi.
contract PixieArenaV3 is IBiteSupplicant {
    using Address for address payable;

    // --- Core structs (same as PixieArena) ---
    struct Arena {
        address creator;
        uint256 entryFee;
        uint256 prizePool;
        uint256 maxAgents;
        uint256 deadline;
        uint256 entryCount;
        bool resolved;
        address ctxSender;
        uint256 totalPnL;
        uint256 sealedOrderCount;
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

    // --- Sealed order structs ---
    struct SealedOrder {
        uint256 entryIndex;
        bytes encryptedOrderData;
        bool executed;
        uint256 amountOut;
    }

    struct TokenDeposit {
        uint256 usdc;
        uint256 weth;
        uint256 wbtc;
    }

    // --- Immutables ---
    IERC20 public immutable token; // USDC
    ISwapRouter public immutable swapRouter;
    address public immutable weth;
    address public immutable wbtc;

    uint256 public constant MAX_SEALED_ORDERS = 12;

    // --- State ---
    uint256 public arenaCount;

    mapping(uint256 => Arena) public arenas;
    mapping(uint256 => mapping(uint256 => Entry)) public entries;
    mapping(uint256 => mapping(uint256 => TradeRecord[])) public tradeLogs;
    mapping(uint256 => SealedOrder[]) public sealedOrders;
    mapping(uint256 => mapping(uint256 => TokenDeposit)) public deposits;
    mapping(address => bool) public allowedTokens;

    // --- Events ---
    event ArenaCreated(uint256 indexed arenaId, address creator, uint256 entryFee, uint256 maxAgents, uint256 deadline, uint256 prizePool);
    event AgentJoined(uint256 indexed arenaId, address owner, uint256 agentId, uint256 entryIndex);
    event TradeRecorded(uint256 indexed arenaId, uint256 entryIndex, uint256 tradeIndex);
    event ArenaFinalized(uint256 indexed arenaId, uint256 entryCount, uint256 sealedOrderCount);
    event StrategiesRevealed(uint256 indexed arenaId, uint256 count);
    event PrizeClaimed(uint256 indexed arenaId, uint256 entryIndex, address owner, uint256 prize);
    event TokensDeposited(uint256 indexed arenaId, uint256 entryIndex, address tokenAddr, uint256 amount);
    event SealedOrderSubmitted(uint256 indexed arenaId, uint256 entryIndex, uint256 orderIndex);
    event SealedOrderExecuted(uint256 indexed arenaId, uint256 entryIndex, uint256 orderIndex, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event SealedOrderFailed(uint256 indexed arenaId, uint256 orderIndex, address tokenIn, address tokenOut, uint256 amountIn);
    event DepositWithdrawn(uint256 indexed arenaId, uint256 entryIndex);

    constructor(address _token, address _swapRouter, address _weth, address _wbtc) {
        token = IERC20(_token);
        swapRouter = ISwapRouter(_swapRouter);
        weth = _weth;
        wbtc = _wbtc;
        allowedTokens[_token] = true;
        allowedTokens[_weth] = true;
        allowedTokens[_wbtc] = true;
    }

    // ========================
    //  ARENA LIFECYCLE
    // ========================

    function createArena(
        uint256 entryFee,
        uint256 maxAgents,
        uint256 duration,
        uint256 prizeAmount
    ) external returns (uint256 arenaId) {
        require(maxAgents >= 2, "Need at least 2 agents");
        require(duration > 0, "Duration must be > 0");
        require(prizeAmount > 0, "Prize must be > 0");

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
        entry.encryptedPnL = encryptedPnL;

        emit TradeRecorded(arenaId, entryIndex, entry.tradeCount - 1);
    }

    // ========================
    //  SEALED ORDERS (NEW)
    // ========================

    /// @notice Deposit tokens to fund sealed conviction orders
    function depositTokens(
        uint256 arenaId,
        uint256 entryIndex,
        address tokenAddr,
        uint256 amount
    ) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];
        require(entry.owner == msg.sender, "Not your entry");
        require(!arena.resolved, "Already resolved");
        require(allowedTokens[tokenAddr], "Token not allowed");
        require(amount > 0, "Amount must be > 0");

        require(IERC20(tokenAddr).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        TokenDeposit storage dep = deposits[arenaId][entryIndex];
        if (tokenAddr == address(token)) dep.usdc += amount;
        else if (tokenAddr == weth) dep.weth += amount;
        else if (tokenAddr == wbtc) dep.wbtc += amount;

        emit TokensDeposited(arenaId, entryIndex, tokenAddr, amount);
    }

    /// @notice Submit a BITE-encrypted sealed swap order — executes at reveal via CTX
    function submitSealedOrder(
        uint256 arenaId,
        uint256 entryIndex,
        bytes calldata encryptedOrderData
    ) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];
        require(entry.owner == msg.sender, "Not your entry");
        require(!arena.resolved, "Already resolved");
        require(arena.sealedOrderCount < MAX_SEALED_ORDERS, "Too many sealed orders");

        sealedOrders[arenaId].push(SealedOrder({
            entryIndex: entryIndex,
            encryptedOrderData: encryptedOrderData,
            executed: false,
            amountOut: 0
        }));

        arena.sealedOrderCount++;

        emit SealedOrderSubmitted(arenaId, entryIndex, sealedOrders[arenaId].length - 1);
    }

    // ========================
    //  FINALIZATION + CTX
    // ========================

    /// @notice Trigger batch CTX — decrypts strategies, P&L, AND executes sealed swaps
    function finalizeArena(uint256 arenaId) external payable {
        Arena storage arena = arenas[arenaId];
        require(!arena.resolved, "Already resolved");
        require(arena.entryCount > 0, "No entries");
        require(
            block.timestamp >= arena.deadline || arena.entryCount >= arena.maxAgents,
            "Arena not ready"
        );

        uint256 entryCount = arena.entryCount;
        uint256 orderCount = arena.sealedOrderCount;

        // Total items: (strategy + pnl) per entry + sealed orders
        uint256 totalItems = entryCount * 2 + orderCount;
        bytes[] memory encryptedArgs = new bytes[](totalItems);
        bytes[] memory plaintextArgs = new bytes[](totalItems);

        // Pack strategies + P&L
        for (uint256 i = 0; i < entryCount; i++) {
            Entry storage entry = entries[arenaId][i];
            encryptedArgs[i * 2] = entry.encryptedStrategy;
            plaintextArgs[i * 2] = abi.encode(arenaId, i, "strategy");
            encryptedArgs[i * 2 + 1] = entry.encryptedPnL;
            plaintextArgs[i * 2 + 1] = abi.encode(arenaId, i, "pnl");
        }

        // Pack sealed orders
        uint256 offset = entryCount * 2;
        SealedOrder[] storage orders = sealedOrders[arenaId];
        for (uint256 i = 0; i < orderCount; i++) {
            encryptedArgs[offset + i] = orders[i].encryptedOrderData;
            // 4-field plaintext distinguishes sealed orders from strategy/pnl (3-field)
            plaintextArgs[offset + i] = abi.encode(arenaId, orders[i].entryIndex, "sealed_order", i);
        }

        // Pre-approve SwapRouter for all tokens (max approval)
        _ensureSwapApprovals();

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

        emit ArenaFinalized(arenaId, entryCount, orderCount);
    }

    /// @notice BITE CTX callback — reveals strategies + P&L AND executes sealed swaps
    function onDecrypt(
        bytes[] calldata decryptedArgs,
        bytes[] calldata plaintextArgs
    ) external override {
        // Decode first plaintext to get arenaId
        (uint256 arenaId,,) = abi.decode(plaintextArgs[0], (uint256, uint256, string));
        Arena storage arena = arenas[arenaId];

        require(msg.sender == arena.ctxSender, "Unauthorized");
        require(!arena.resolved, "Already resolved");

        for (uint256 i = 0; i < decryptedArgs.length; i++) {
            // Check if this is a sealed order (4-field plaintext) or strategy/pnl (3-field)
            if (_isSealedOrderPlaintext(plaintextArgs[i])) {
                _processSealedOrder(arenaId, decryptedArgs[i], plaintextArgs[i]);
            } else {
                _processStrategyOrPnl(arenaId, decryptedArgs[i], plaintextArgs[i]);
            }
        }

        arena.resolved = true;
        emit StrategiesRevealed(arenaId, arena.entryCount);
    }

    function _processStrategyOrPnl(
        uint256 arenaId,
        bytes calldata decryptedData,
        bytes calldata plaintextData
    ) internal {
        (uint256 aId, uint256 entryIndex, string memory dataType) = abi.decode(
            plaintextData, (uint256, uint256, string)
        );
        require(aId == arenaId, "Arena mismatch");

        Entry storage entry = entries[arenaId][entryIndex];

        if (keccak256(bytes(dataType)) == keccak256(bytes("pnl"))) {
            int256 pnl = abi.decode(decryptedData, (int256));
            entry.revealedPnL = pnl;
        }

        entry.revealed = true;
    }

    function _processSealedOrder(
        uint256 arenaId,
        bytes calldata decryptedData,
        bytes calldata plaintextData
    ) internal {
        (uint256 aId, uint256 entryIndex,, uint256 orderIndex) = abi.decode(
            plaintextData, (uint256, uint256, string, uint256)
        );
        require(aId == arenaId, "Arena mismatch");

        // Decode the DECRYPTED swap params
        (address tokenIn, address tokenOut, uint256 amountIn) = abi.decode(
            decryptedData, (address, address, uint256)
        );

        // Cap to available deposit
        TokenDeposit storage dep = deposits[arenaId][entryIndex];
        uint256 available = _getDepositBalance(dep, tokenIn);
        if (amountIn > available) amountIn = available;

        SealedOrder storage order = sealedOrders[arenaId][orderIndex];

        if (amountIn > 0) {
            // Deduct from deposit
            _deductDeposit(dep, tokenIn, amountIn);

            // Execute REAL swap on Algebra DEX inside CTX callback
            uint256 amountOut = _executeSealedSwap(arenaId, orderIndex, tokenIn, tokenOut, amountIn);

            if (amountOut > 0) {
                // Credit output to agent's deposit
                _creditDeposit(dep, tokenOut, amountOut);
                order.executed = true;
                order.amountOut = amountOut;
                emit SealedOrderExecuted(arenaId, entryIndex, orderIndex, tokenIn, tokenOut, amountIn, amountOut);
            } else {
                // Swap failed — refund input
                _creditDeposit(dep, tokenIn, amountIn);
                emit SealedOrderFailed(arenaId, orderIndex, tokenIn, tokenOut, amountIn);
            }
        }
    }

    /// @notice Execute a real Algebra DEX swap from within the CTX callback
    function _executeSealedSwap(
        uint256 arenaId,
        uint256 orderIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        ExactInputSingleParams memory params = ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            deployer: address(0),       // standard pool
            recipient: address(this),   // tokens come back to this contract
            deadline: block.timestamp + 3600,
            amountIn: amountIn,
            amountOutMinimum: 0,        // accept any output for sealed orders
            limitSqrtPrice: 0
        });

        try swapRouter.exactInputSingle{gas: 8000000}(params) returns (uint256 out) {
            amountOut = out;
        } catch {
            amountOut = 0;
        }
    }

    // ========================
    //  DEPOSIT MANAGEMENT
    // ========================

    /// @notice Withdraw remaining deposits after arena resolution
    function withdrawDeposit(uint256 arenaId, uint256 entryIndex) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];
        require(arena.resolved, "Not resolved");
        require(entry.owner == msg.sender, "Not your entry");

        _transferDepositsToOwner(arenaId, entryIndex, msg.sender);
        emit DepositWithdrawn(arenaId, entryIndex);
    }

    /// @notice Emergency withdrawal if CTX never fires (deadline + 1 hour grace)
    function emergencyWithdrawDeposit(uint256 arenaId, uint256 entryIndex) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];
        require(entry.owner == msg.sender, "Not your entry");
        require(!arena.resolved, "Already resolved - use withdrawDeposit");
        require(block.timestamp > arena.deadline + 3600, "Grace period not elapsed");

        _transferDepositsToOwner(arenaId, entryIndex, msg.sender);
        emit DepositWithdrawn(arenaId, entryIndex);
    }

    function claimPrize(uint256 arenaId, uint256 entryIndex) external {
        Arena storage arena = arenas[arenaId];
        Entry storage entry = entries[arenaId][entryIndex];

        require(arena.resolved, "Not resolved");
        require(entry.owner == msg.sender, "Not your entry");
        require(!entry.claimed, "Already claimed");
        require(entry.revealed, "Not revealed");

        entry.claimed = true;

        uint256 prize = arena.prizePool / arena.entryCount;
        require(token.transfer(msg.sender, prize), "Transfer failed");

        emit PrizeClaimed(arenaId, entryIndex, msg.sender, prize);
    }

    // ========================
    //  INTERNAL HELPERS
    // ========================

    function _ensureSwapApprovals() internal {
        uint256 maxApproval = type(uint256).max;
        IERC20(address(token)).approve(address(swapRouter), maxApproval);
        IERC20(weth).approve(address(swapRouter), maxApproval);
        IERC20(wbtc).approve(address(swapRouter), maxApproval);
    }

    function _isSealedOrderPlaintext(bytes calldata pt) internal pure returns (bool) {
        // Sealed orders encode 4 fields: (uint256, uint256, string, uint256)
        // Strategy/PnL encode 3 fields: (uint256, uint256, string)
        // 4-field encoding is always longer than 3-field with short strings
        // Minimum 4-field size: 4*32 + string overhead > 3*32 + string overhead
        // We detect by trying to decode 4 fields
        if (pt.length < 192) return false; // too short for 4-field
        // Check if the string at offset[2] is "sealed_order"
        (, , string memory dataType) = abi.decode(pt, (uint256, uint256, string));
        return keccak256(bytes(dataType)) == keccak256(bytes("sealed_order"));
    }

    function _getDepositBalance(TokenDeposit storage dep, address tokenAddr) internal view returns (uint256) {
        if (tokenAddr == address(token)) return dep.usdc;
        if (tokenAddr == weth) return dep.weth;
        if (tokenAddr == wbtc) return dep.wbtc;
        return 0;
    }

    function _deductDeposit(TokenDeposit storage dep, address tokenAddr, uint256 amount) internal {
        if (tokenAddr == address(token)) { require(dep.usdc >= amount, "Insufficient USDC"); dep.usdc -= amount; }
        else if (tokenAddr == weth) { require(dep.weth >= amount, "Insufficient WETH"); dep.weth -= amount; }
        else if (tokenAddr == wbtc) { require(dep.wbtc >= amount, "Insufficient WBTC"); dep.wbtc -= amount; }
    }

    function _creditDeposit(TokenDeposit storage dep, address tokenAddr, uint256 amount) internal {
        if (tokenAddr == address(token)) dep.usdc += amount;
        else if (tokenAddr == weth) dep.weth += amount;
        else if (tokenAddr == wbtc) dep.wbtc += amount;
    }

    function _transferDepositsToOwner(uint256 arenaId, uint256 entryIndex, address owner) internal {
        TokenDeposit storage dep = deposits[arenaId][entryIndex];

        if (dep.usdc > 0) {
            uint256 amt = dep.usdc;
            dep.usdc = 0;
            require(token.transfer(owner, amt), "USDC transfer failed");
        }
        if (dep.weth > 0) {
            uint256 amt = dep.weth;
            dep.weth = 0;
            require(IERC20(weth).transfer(owner, amt), "WETH transfer failed");
        }
        if (dep.wbtc > 0) {
            uint256 amt = dep.wbtc;
            dep.wbtc = 0;
            require(IERC20(wbtc).transfer(owner, amt), "WBTC transfer failed");
        }
    }

    // ========================
    //  VIEW FUNCTIONS
    // ========================

    function getArena(uint256 arenaId) external view returns (
        address creator, uint256 entryFee, uint256 prizePool,
        uint256 maxAgents, uint256 deadline, uint256 entryCount,
        bool resolved, uint256 sealedOrderCount_
    ) {
        Arena storage a = arenas[arenaId];
        return (a.creator, a.entryFee, a.prizePool, a.maxAgents,
                a.deadline, a.entryCount, a.resolved, a.sealedOrderCount);
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

    function getSealedOrderCount(uint256 arenaId) external view returns (uint256) {
        return sealedOrders[arenaId].length;
    }

    function getSealedOrder(uint256 arenaId, uint256 orderIndex) external view returns (
        uint256 entryIndex, bool executed, uint256 amountOut
    ) {
        SealedOrder storage o = sealedOrders[arenaId][orderIndex];
        return (o.entryIndex, o.executed, o.amountOut);
    }

    function getDeposit(uint256 arenaId, uint256 entryIndex) external view returns (
        uint256 usdc, uint256 wethBal, uint256 wbtcBal
    ) {
        TokenDeposit storage d = deposits[arenaId][entryIndex];
        return (d.usdc, d.weth, d.wbtc);
    }
}
