// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title A vault for redeemable tokens supporting ERC721 and ERC1155 standards.
contract RedeemableTokenVault is IERC721Receiver, IERC1155Receiver, Ownable {
    using ECDSA for bytes32;

    // Emitted when a token is deposited into the vault.
    event TokenDeposited(
        address depositor,
        uint256 depositId,
        address tokenContract,
        uint256 tokenId
    );

    // Emitted when a token is withdrawn from the vault.
    event TokenWithdrawn(address withdrawer, uint256 depositId);

    // Represents the structure of a token in the vault.
    struct Token {
        address contractAddress; // Address of the token's contract.
        uint256 tokenId; // ID of the specific token.
        bool isERC1155; // True if the token is ERC1155, false if ERC721.
    }

    uint256 public nextDepositId; // Incremental ID for the next deposit.

    // Address of the authorized signer
    address public authorizedSigner;

    // Mapping to check if an address is authorized to deposit.
    mapping(address => bool) public isDepositorAllowed;

    // Mapping of depositId to Token data.
    mapping(uint256 => Token) public tokenVault;

    // Mapping to prevent signature reuse.
    mapping(bytes32 => bool) private signatureAlreadyUsed;
 
    // Mapping of deposit ID to associated withdrawal fees.
    mapping(uint256 => uint256) public withdrawalFees;

    // Function to receive Ether. The existence of this function makes the contract payable.
    receive() external payable {}

    /// @notice Deposits an ERC721 token into the vault.
    /// @param tokenContract The address of the ERC721 contract.
    /// @param tokenId The ID of the token being deposited.
    function depositERC721(address tokenContract, uint256 tokenId) external {
        require(isDepositorAllowed[msg.sender], "Depositor not authorized");
        
        nextDepositId++;

        tokenVault[nextDepositId] = Token({
            contractAddress: tokenContract,
            tokenId: tokenId,
            isERC1155: false
        });

        IERC721(tokenContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        emit TokenDeposited(msg.sender, nextDepositId, tokenContract, tokenId);
    }

    /// @notice Deposits an ERC1155 token into the vault.
    /// @dev This function is designed to handle single token deposits.
    /// @param tokenContract The address of the ERC1155 contract.
    /// @param tokenId The ID of the token being deposited.
    function depositERC1155(address tokenContract, uint256 tokenId) external {
        require(isDepositorAllowed[msg.sender], "Depositor not authorized");

        nextDepositId++;

        tokenVault[nextDepositId] = Token({
            contractAddress: tokenContract,
            tokenId: tokenId,
            isERC1155: true
        });

        IERC1155(tokenContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            1,
            ""
        );
        emit TokenDeposited(msg.sender, nextDepositId, tokenContract, tokenId);
    }

    /// @notice Withdraws a token from the vault using a signature for authentication.
    /// @param depositId The ID of the deposit to withdraw.
    /// @param signature The signature produced by the owner, authorizing the withdrawal.
    /// @param expiryBlockHeight The block number at which the signature expires.
    function withdrawWithSignature(
        uint256 depositId,
        bytes memory signature,
        uint256 expiryBlockHeight
    ) external payable {
        require(block.number <= expiryBlockHeight, "Signature expired");

        Token memory tokenData = tokenVault[depositId];

        uint256 requiredFee = withdrawalFees[depositId];
        require(msg.value >= requiredFee, "Insufficient fee paid");

        bytes32 hash = keccak256(
            abi.encodePacked(
                msg.sender,
                depositId,
                expiryBlockHeight,
                address(this)
            )
        ).toEthSignedMessageHash();

        require(!signatureAlreadyUsed[hash], "Signature already used");
        signatureAlreadyUsed[hash] = true;

        address signer = hash.recover(signature);
        require(signer == authorizedSigner, "Invalid signature");

        if (tokenData.isERC1155) {
            IERC1155(tokenData.contractAddress).safeTransferFrom(
                address(this),
                msg.sender,
                tokenData.tokenId,
                1,
                ""
            );
        } else {
            IERC721(tokenData.contractAddress).safeTransferFrom(
                address(this),
                msg.sender,
                tokenData.tokenId
            );
        }

        delete tokenVault[depositId]; // Cleans up the withdrawn token data.
        emit TokenWithdrawn(msg.sender, depositId);
    }

    /// @notice Implements the IERC721Receiver onERC721Received function to allow safe transfers.
    /// @dev This is required to comply with the ERC721 standard for receiving tokens.
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) pure external override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @notice Implements the IERC1155Receiver onERC1155Received function to allow safe transfers.
    /// @dev This is required to comply with the ERC1155 standard for receiving tokens.
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) pure external override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /// @notice Required to comply with the ERC1155 standard for batch receiving tokens.
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes calldata
    ) external pure override returns (bytes4) {
        revert("This contract does not support batch deposits.");
    }

    /// @notice Sets the withdrawal fee for a specific deposit.
    /// @param depositId The ID of the deposit.
    /// @param fee The fee amount in wei.
    function setWithdrawalFee(
        uint256 depositId,
        uint256 fee
    ) external onlyOwner {
        require(depositId <= nextDepositId, "Invalid deposit ID");
        require(
            tokenVault[depositId].contractAddress != address(0),
            "No token associated with deposit ID"
        );

        withdrawalFees[depositId] = fee;
    }

    /// @notice Sets the address of the authorized signer.
    /// @param _signer The address to set as the authorized signer.
    function setAuthorizedSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Invalid signer address");
        authorizedSigner = _signer;
    }

    /// @notice Authorizes an address to deposit tokens.
    /// @param depositor The address to authorize.
    function authorizeDepositor(address depositor) external onlyOwner {
        isDepositorAllowed[depositor] = true;
    }

    /// @notice Revokes an address' authorization to deposit tokens.
    /// @param depositor The address to revoke authorization from.
    function revokeDepositorAuthorization(
        address depositor
    ) external onlyOwner {
        isDepositorAllowed[depositor] = false;
    }

    /// @notice Allows the owner to withdraw tokens in a specified ID range in case of an emergency.
    /// @param startId The starting deposit ID.
    /// @param endId The ending deposit ID.
    /// @param recipient The address receiving the tokens.
    function emergencyBatchWithdrawal(
        uint256 startId,
        uint256 endId,
        address recipient
    ) external onlyOwner {
        require(recipient != address(0), "Invalid recipient address");
        require(
            startId > 0 && startId <= endId && endId <= nextDepositId,
            "Invalid ID range"
        );

        for (uint256 i = startId; i <= endId; i++) {
            if (tokenVault[i].contractAddress == address(0)) continue; // Skip already withdrawn tokens.

            Token memory tokenData = tokenVault[i];

            if (tokenData.isERC1155) {
                IERC1155(tokenData.contractAddress).safeTransferFrom(
                    address(this),
                    recipient,
                    tokenData.tokenId,
                    1,
                    ""
                );
            } else {
                IERC721(tokenData.contractAddress).safeTransferFrom(
                    address(this),
                    recipient,
                    tokenData.tokenId
                );
            }

            delete tokenVault[i]; // Cleans up the withdrawn token data.
        }
    }

    /// @notice Allows the owner to withdraw a specific ERC721 token in case of an emergency.
    /// @param tokenContract The ERC721 token's contract address.
    /// @param tokenId The ID of the token.
    /// @param recipient The address receiving the token.
    function emergencyERC721Withdrawal(
        address tokenContract,
        uint256 tokenId,
        address recipient
    ) external onlyOwner {
        require(recipient != address(0), "Invalid recipient address");

        IERC721(tokenContract).safeTransferFrom(
            address(this),
            recipient,
            tokenId
        );
    }

    /// @notice Allows the owner to withdraw a specific ERC1155 token in case of an emergency.
    /// @param tokenContract The ERC1155 token's contract address.
    /// @param tokenId The ID of the token.
    /// @param amount The amount of ERC1155 tokens to withdraw.
    /// @param recipient The address receiving the token.
    function emergencyERC1155Withdrawal(
        address tokenContract,
        uint256 tokenId,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        require(recipient != address(0), "Invalid recipient address");

        IERC1155(tokenContract).safeTransferFrom(
            address(this),
            recipient,
            tokenId,
            amount,
            ""
        );
    }

    /// @notice Withdraws Ether from the contract.
    function withdrawEther(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient address");
        uint256 balance = address(this).balance;
        payable(recipient).transfer(balance);
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
