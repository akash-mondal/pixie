// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import { BITE } from "@skalenetwork/bite-solidity/BITE.sol";
import { IBiteSupplicant } from "@skalenetwork/bite-solidity/interfaces/IBiteSupplicant.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/// @title GamifiedLP — Sealed-Bid LP Vault with BITE CTX Batch Reveal
/// @notice Agents deposit USDC with encrypted LP strategies. A batch CTX reveals
///         all strategies simultaneously. Rewards are distributed proportional
///         to amount * lockDays — better commitment = more reward.
contract GamifiedLP is IBiteSupplicant {
    using Address for address payable;

    struct Pool {
        address creator;
        uint256 depositDeadline;
        uint256 minDepositors;
        uint256 maxDepositors;
        uint256 minDeposit;
        uint256 maxDeposit;
        uint256 rewardAmount;
        uint256 totalDeposited;
        uint256 depositCount;
        bool resolved;
        uint256 totalWeight;
        address ctxSender;
        uint256 gracePeriod; // blocks after deadline for emergency withdraw
    }

    struct Deposit {
        address depositor;
        uint256 amount;
        bytes encryptedStrategy;
        int24 tickLower;
        int24 tickUpper;
        uint256 lockDays;
        bool revealed;
        bool claimed;
    }

    IERC20 public immutable token;
    uint256 public poolCount;

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(uint256 => Deposit)) public deposits;

    // --- Events (full audit trail) ---
    event PoolCreated(uint256 indexed poolId, address creator, uint256 deadline, uint256 minDepositors, uint256 rewardAmount);
    event DepositMade(uint256 indexed poolId, address depositor, uint256 amount, uint256 index);
    event ResolutionTriggered(uint256 indexed poolId, uint256 depositCount, string triggerType);
    event StrategiesRevealed(uint256 indexed poolId, uint256 count, uint256 totalWeight);
    event RewardClaimed(uint256 indexed poolId, address depositor, uint256 depositAmount, uint256 reward);
    event EmergencyWithdraw(uint256 indexed poolId, address depositor, uint256 amount, string reason);

    constructor(address _token) {
        token = IERC20(_token);
    }

    /// @notice Create a new sealed-bid LP pool with guardrails
    function createPool(
        uint256 deadline,
        uint256 minDepositors,
        uint256 maxDepositors,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 rewardAmount,
        uint256 gracePeriod
    ) external returns (uint256 poolId) {
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(minDepositors > 0, "Need at least 1 depositor");
        require(maxDepositors >= minDepositors, "Max < min depositors");
        require(maxDeposit >= minDeposit, "Max < min deposit");
        require(rewardAmount > 0, "Reward must be > 0");

        // Transfer reward from creator
        require(token.transferFrom(msg.sender, address(this), rewardAmount), "Reward transfer failed");

        poolId = poolCount++;
        Pool storage pool = pools[poolId];
        pool.creator = msg.sender;
        pool.depositDeadline = deadline;
        pool.minDepositors = minDepositors;
        pool.maxDepositors = maxDepositors;
        pool.minDeposit = minDeposit;
        pool.maxDeposit = maxDeposit;
        pool.rewardAmount = rewardAmount;
        pool.gracePeriod = gracePeriod;

        emit PoolCreated(poolId, msg.sender, deadline, minDepositors, rewardAmount);
    }

    /// @notice Deposit USDC with an encrypted LP strategy
    function deposit(uint256 poolId, uint256 amount, bytes calldata encryptedStrategy) external {
        Pool storage pool = pools[poolId];
        require(pool.creator != address(0), "Pool does not exist");
        require(block.timestamp < pool.depositDeadline, "Deposit deadline passed");
        require(pool.depositCount < pool.maxDepositors, "Pool full");
        require(amount >= pool.minDeposit, "Below min deposit");
        require(amount <= pool.maxDeposit, "Above max deposit");
        require(!pool.resolved, "Pool already resolved");

        require(token.transferFrom(msg.sender, address(this), amount), "Deposit transfer failed");

        uint256 index = pool.depositCount;
        Deposit storage dep = deposits[poolId][index];
        dep.depositor = msg.sender;
        dep.amount = amount;
        dep.encryptedStrategy = encryptedStrategy;

        pool.totalDeposited += amount;
        pool.depositCount++;

        emit DepositMade(poolId, msg.sender, amount, index);
    }

    /// @notice Trigger batch CTX reveal — permissionless once conditions met
    function resolve(uint256 poolId) external payable {
        Pool storage pool = pools[poolId];
        require(!pool.resolved, "Already resolved");
        require(pool.depositCount > 0, "No deposits");

        string memory triggerType;
        if (pool.depositCount >= pool.minDepositors) {
            triggerType = "depositorThreshold";
        } else if (block.timestamp >= pool.depositDeadline) {
            triggerType = "deadline";
        } else {
            revert("Conditions not met");
        }

        // Collect all encrypted strategies
        bytes[] memory encryptedArgs = new bytes[](pool.depositCount);
        bytes[] memory plaintextArgs = new bytes[](pool.depositCount);

        for (uint256 i = 0; i < pool.depositCount; i++) {
            encryptedArgs[i] = deposits[poolId][i].encryptedStrategy;
            plaintextArgs[i] = abi.encode(poolId, i); // pass poolId + index as plaintext
        }

        // Submit batch CTX — all strategies decrypted in one atomic callback
        uint256 gasLimit = msg.value / tx.gasprice;
        address payable callbackSender = BITE.submitCTX(
            BITE.SUBMIT_CTX_ADDRESS,
            gasLimit,
            encryptedArgs,
            plaintextArgs
        );

        pool.ctxSender = callbackSender;

        // Forward gas payment to callback sender
        callbackSender.sendValue(msg.value);

        emit ResolutionTriggered(poolId, pool.depositCount, triggerType);
    }

    /// @notice BITE CTX callback — decrypts all strategies simultaneously
    ///         and computes totalWeight = Σ(amount × lockDays) for reward distribution
    function onDecrypt(
        bytes[] calldata decryptedArgs,
        bytes[] calldata plaintextArgs
    ) external override {
        // Decode first plaintext to get poolId
        (uint256 poolId,) = abi.decode(plaintextArgs[0], (uint256, uint256));
        Pool storage pool = pools[poolId];

        require(msg.sender == pool.ctxSender, "Unauthorized: not CTX sender");
        require(!pool.resolved, "Already resolved");

        uint256 totalWeight = 0;

        for (uint256 i = 0; i < decryptedArgs.length; i++) {
            (, uint256 depositIndex) = abi.decode(plaintextArgs[i], (uint256, uint256));
            (int24 tickLower, int24 tickUpper, uint256 lockDays) = abi.decode(
                decryptedArgs[i],
                (int24, int24, uint256)
            );

            Deposit storage dep = deposits[poolId][depositIndex];
            dep.tickLower = tickLower;
            dep.tickUpper = tickUpper;
            dep.lockDays = lockDays;
            dep.revealed = true;

            // weight = amount * lockDays
            totalWeight += dep.amount * lockDays;
        }

        pool.totalWeight = totalWeight;
        pool.resolved = true;
        emit StrategiesRevealed(poolId, decryptedArgs.length, totalWeight);
    }

    /// @notice Claim deposit + proportional reward
    function claimReward(uint256 poolId, uint256 depositIndex) external {
        Pool storage pool = pools[poolId];
        Deposit storage dep = deposits[poolId][depositIndex];

        require(pool.resolved, "Not resolved yet");
        require(dep.depositor == msg.sender, "Not your deposit");
        require(!dep.claimed, "Already claimed");
        require(dep.revealed, "Strategy not revealed");

        dep.claimed = true;

        // weight = amount * lockDays
        uint256 weight = dep.amount * dep.lockDays;
        uint256 reward = 0;
        if (pool.totalWeight > 0) {
            reward = (weight * pool.rewardAmount) / pool.totalWeight;
        }

        // Transfer deposit + reward
        uint256 total = dep.amount + reward;
        require(token.transfer(msg.sender, total), "Transfer failed");

        emit RewardClaimed(poolId, msg.sender, dep.amount, reward);
    }

    /// @notice Emergency withdrawal if pool stalls
    function emergencyWithdraw(uint256 poolId, uint256 depositIndex) external {
        Pool storage pool = pools[poolId];
        Deposit storage dep = deposits[poolId][depositIndex];

        require(dep.depositor == msg.sender, "Not your deposit");
        require(!dep.claimed, "Already claimed");

        // Only available if deadline + grace period passed and pool not resolved
        require(
            !pool.resolved && block.timestamp >= pool.depositDeadline + pool.gracePeriod,
            "Emergency conditions not met"
        );

        dep.claimed = true;
        require(token.transfer(msg.sender, dep.amount), "Transfer failed");

        emit EmergencyWithdraw(poolId, msg.sender, dep.amount, "deadline_grace_expired");
    }

    // --- View functions ---
    function getDeposit(uint256 poolId, uint256 index) external view returns (
        address depositor, uint256 amount, int24 tickLower, int24 tickUpper,
        uint256 lockDays, bool revealed, bool claimed
    ) {
        Deposit storage dep = deposits[poolId][index];
        return (dep.depositor, dep.amount, dep.tickLower, dep.tickUpper,
                dep.lockDays, dep.revealed, dep.claimed);
    }

    function getPool(uint256 poolId) external view returns (
        address creator, uint256 depositDeadline, uint256 minDepositors,
        uint256 maxDepositors, uint256 depositCount, uint256 totalDeposited,
        uint256 rewardAmount, bool resolved, uint256 totalWeight
    ) {
        Pool storage pool = pools[poolId];
        return (pool.creator, pool.depositDeadline, pool.minDepositors,
                pool.maxDepositors, pool.depositCount, pool.totalDeposited,
                pool.rewardAmount, pool.resolved, pool.totalWeight);
    }
}
