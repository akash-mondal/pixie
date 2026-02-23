// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PixieReputationRegistry — Simplified ERC-8004 Reputation Registry
/// @notice Non-upgradeable version for SKALE hackathon. Same interface as ERC-8004.
/// @dev Stores structured feedback per agent with tag-based filtering.
interface IPixieIdentityRegistry {
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}

contract PixieReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string tag1,
        string tag2,
        string endpoint
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    int128 private constant MAX_ABS_VALUE = 1e38;
    address public immutable identityRegistry;

    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _clientExists;

    constructor(address identityRegistry_) {
        require(identityRegistry_ != address(0), "bad identity");
        identityRegistry = identityRegistry_;
    }

    /// @notice Submit feedback for an agent
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint
    ) external {
        require(valueDecimals <= 18, "too many decimals");
        require(value >= -MAX_ABS_VALUE && value <= MAX_ABS_VALUE, "value too large");
        require(!IPixieIdentityRegistry(identityRegistry).isAuthorizedOrOwner(msg.sender, agentId), "Self-feedback not allowed");

        uint64 currentIndex = ++_lastIndex[agentId][msg.sender];

        _feedback[agentId][msg.sender][currentIndex] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }

        emit NewFeedback(agentId, msg.sender, currentIndex, value, valueDecimals, tag1, tag2, endpoint);
    }

    /// @notice Revoke own feedback
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][msg.sender], "index out of bounds");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");
        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /// @notice Read a single feedback entry
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "index out of bounds");
        Feedback storage f = _feedback[agentId][clientAddress][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    /// @notice Get aggregated reputation summary
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        address[] memory clientList;
        if (clientAddresses.length > 0) {
            clientList = new address[](clientAddresses.length);
            for (uint256 k; k < clientAddresses.length; k++) {
                clientList[k] = clientAddresses[k];
            }
        } else {
            clientList = _clients[agentId];
        }
        if (clientList.length == 0) return (0, 0, 0);

        bytes32 emptyHash = keccak256(bytes(""));
        bytes32 tag1Hash = keccak256(bytes(tag1));
        int256 sum;

        for (uint256 i; i < clientList.length; i++) {
            uint64 lastIdx = _lastIndex[agentId][clientList[i]];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][clientList[i]][j];
                if (fb.isRevoked) continue;
                if (emptyHash != tag1Hash && tag1Hash != keccak256(bytes(fb.tag1))) continue;

                sum += int256(fb.value);
                count++;
            }
        }

        if (count == 0) return (0, 0, 0);
        summaryValue = int128(sum / int256(uint256(count)));
        summaryValueDecimals = 0;
    }

    /// @notice Get all clients who gave feedback
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    /// @notice Get last feedback index for a client
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }
}
