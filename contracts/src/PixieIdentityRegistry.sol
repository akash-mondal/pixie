// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title PixieIdentityRegistry — Simplified ERC-8004 Identity Registry
/// @notice Non-upgradeable version for SKALE hackathon. Same interface as ERC-8004.
/// @dev ERC-721 based agent identity with metadata storage.
contract PixieIdentityRegistry is ERC721 {
    uint256 private _lastId;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => string) private _agentURIs;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string metadataKey, bytes metadataValue);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    constructor() ERC721("AgentIdentity", "AGENT") {}

    /// @notice Register a new agent identity (mint NFT)
    function register() external returns (uint256 agentId) {
        agentId = _lastId++;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        emit Registered(agentId, "", msg.sender);
    }

    /// @notice Register with URI
    function registerWithURI(string calldata _agentURI) external returns (uint256 agentId) {
        agentId = _lastId++;
        _metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;
        emit Registered(agentId, _agentURI, msg.sender);
    }

    /// @notice Get agent metadata
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    /// @notice Set agent metadata (owner or approved only)
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "Not authorized");
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataValue);
    }

    /// @notice Set agent URI
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "Not authorized");
        _agentURIs[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @notice Get agent wallet address
    function getAgentWallet(uint256 agentId) external view returns (address) {
        bytes memory walletData = _metadata[agentId]["agentWallet"];
        if (walletData.length == 0) return address(0);
        return address(bytes20(walletData));
    }

    /// @notice Get agent URI
    function agentURI(uint256 agentId) external view returns (string memory) {
        return _agentURIs[agentId];
    }

    /// @notice Check if address is owner or approved for agent
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        return _isOwnerOrApproved(spender, agentId);
    }

    /// @notice Total registered agents
    function agentCount() external view returns (uint256) {
        return _lastId;
    }

    function _isOwnerOrApproved(address spender, uint256 agentId) internal view returns (bool) {
        address owner = ownerOf(agentId);
        return spender == owner || isApprovedForAll(owner, spender) || getApproved(agentId) == spender;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId); // Reverts if doesn't exist
        return _agentURIs[tokenId];
    }
}
