// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RedeemableTokenVault
/// @dev A contract that allows authorized addresses to deposit ERC721 and ERC1155 tokens.
/// Users with a valid signature can later withdraw tokens.
contract RedeemableTokenVault is IERC721Receiver, IERC1155Receiver, Ownable {
    using ECDSA for bytes32;

    /// @dev Struct to store details about the deposited token.
    struct Token {
        address depositor;
        address contractAddress;
        uint256 tokenId;
        bool isERC1155;
        uint256 amount; // Only used for ERC1155
    }

    uint256 private depositId = 0;

    /// @dev A list to check if an address is authorized to deposit.
    mapping(address => bool) public isAllowed;

    /// @dev Mapping of depositId to Token data.
    mapping(uint256 => Token) public vault;

    /// @dev Mapping to check if a user has deposited a specific tokenId.
    mapping(address => mapping(uint256 => uint256)) private depositedTokens; // user => tokenId => depositId

    /// @dev Mapping to prevent signature from being reused.
    mapping(bytes32 => bool) public usedSignatures;

    /// @dev Emitted when a token is deposited.
    event Deposited(
        address indexed user,
        uint256 _depositId,
        address tokenAddress,
        uint256 tokenId
    );

    /// @dev Emitted when a token is withdrawn.
    event Withdrawn(address indexed user, uint256 _depositId);

    // Mapping to store the fee associated with each deposit
    mapping(uint256 => uint256) public depositWithdrawalFees;

    receive() external payable {}

    /// @dev Setter function for the owner to set the withdrawal fee for a specific deposit.
    /// @param _depositId The ID of the deposit.
    /// @param fee The fee associated with the deposit.
    function setWithdrawalFeeForDeposit(
        uint256 _depositId,
        uint256 fee
    ) external onlyOwner {
        depositWithdrawalFees[_depositId] = fee;
    }

    /// @notice Add an address to the list of addresses that are allowed to deposit tokens.
    /// @param user The address to be added.
    function addToAllowedList(address user) external onlyOwner {
        isAllowed[user] = true;
    }

    /// @notice Remove an address from the list of addresses that are allowed to deposit tokens.
    /// @param user The address to be removed.
    function removeFromAllowedList(address user) external onlyOwner {
        isAllowed[user] = false;
    }

    /// @notice Deposit an ERC721 token into the contract.
    /// @param tokenAddress The address of the ERC721 contract.
    /// @param tokenId The ID of the token being deposited.
    function depositERC721(address tokenAddress, uint256 tokenId) external {
        require(isAllowed[msg.sender], "Not authorized to deposit");

        IERC721(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        depositId++;

        vault[depositId] = Token(msg.sender, tokenAddress, tokenId, false, 0);
        depositedTokens[msg.sender][tokenId] = depositId;

        emit Deposited(msg.sender, depositId, tokenAddress, tokenId);
    }

    /// @notice Deposit an ERC1155 token into the contract.
    /// @dev Always test for potential gas limitations.
    /// @param tokenAddress The address of the ERC1155 contract.
    /// @param tokenId The ID of the token being deposited.
    function depositERC1155(
        address tokenAddress,
        uint256 tokenId
    ) external {
        require(isAllowed[msg.sender], "Not authorized to deposit");

        IERC1155(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            1,
            ""
        );

            depositId++;
            vault[depositId] = Token(
                msg.sender,
                tokenAddress,
                tokenId,
                true,
                1
            );
            // We maintain a mapping to track deposit IDs for a specific token and user
            depositedTokens[msg.sender][tokenId] = depositId;

            emit Deposited(msg.sender, depositId, tokenAddress, tokenId);
    }

    /// @notice Withdraw a token from the contract.
    /// @param _depositId The ID of the deposit to be withdrawn.
    /// @param _signature A valid signature from the contract owner authorizing the withdrawal.
    /// @param _expiryBlockHeight The block height after which the signature is no longer valid.
    function withdrawWithSignature(
        uint256 _depositId,
        bytes memory _signature,
        uint256 _expiryBlockHeight
    ) external payable {
        require(
            block.number <= _expiryBlockHeight,
            "Signature expired"
        );

        Token memory tokenData = vault[_depositId];

        uint256 requiredFee = depositWithdrawalFees[_depositId];
        require(msg.value >= requiredFee, "Insufficient fee paid");

        bytes32 hash = keccak256(abi.encodePacked(msg.sender, _depositId,   _expiryBlockHeight))
            .toEthSignedMessageHash();

        require(!usedSignatures[hash], "Signature has already been used");
        usedSignatures[hash] = true;

        address signer = hash.recover(_signature);

        require(signer == owner(), "Invalid signature");

        if (tokenData.isERC1155) {
            IERC1155(tokenData.contractAddress).safeTransferFrom(
                address(this),
                msg.sender,
                tokenData.tokenId,
                tokenData.amount,
                ""
            );
        } else {
            IERC721(tokenData.contractAddress).safeTransferFrom(
                address(this),
                msg.sender,
                tokenData.tokenId
            );
        }

        delete vault[_depositId]; // This line is essential to clean up
        delete depositedTokens[tokenData.depositor][tokenData.tokenId];

        emit Withdrawn(msg.sender, _depositId);
    }

    /// @notice Emergency function to transfer all vaulted tokens to another address.
    /// @dev This function can only be called by the owner.
    /// @param receiver The address to receive the withdrawn tokens.
    function emergencyWithdrawAll(address receiver) external onlyOwner {
        require(receiver != address(0), "Invalid address");

        for (uint256 i = 1; i <= depositId; i++) {
            if (vault[i].contractAddress == address(0)) continue; // skip already withdrawn tokens

            Token memory tokenData = vault[i];

            if (tokenData.isERC1155) {
                IERC1155(tokenData.contractAddress).safeTransferFrom(
                    address(this),
                    receiver,
                    tokenData.tokenId,
                    tokenData.amount,
                    ""
                );
            } else {
                IERC721(tokenData.contractAddress).safeTransferFrom(
                    address(this),
                    receiver,
                    tokenData.tokenId
                );
            }
            delete vault[i]; // Delete the token data from the vault
        }
    }

    /// @notice Allows the owner to withdraw the entire balance of the contract.
    /// @param receiver The address to receive the contract balance.
    function withdrawBalance(address receiver) external onlyOwner {
        payable(receiver).transfer(address(this).balance);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        revert("Batch transfer not supported.");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(Ownable).interfaceId;
    }
}
