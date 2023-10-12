# RedeemableTokenVault README

## Overview

The `RedeemableTokenVault` contract facilitates the depositing of both ERC721 and ERC1155 tokens. Authorized addresses are permitted to deposit tokens, while other users can withdraw these tokens using a valid signature from the contract owner.

<img width="1437" alt="Screenshot 2023-10-12 at 22 48 37" src="https://github.com/The-Nifty/redeemables-solidity-contract/assets/10786611/7963f058-01bd-428d-86c4-f1bbf5125f41">

## Key Features

- **Deposit** - Authorized addresses can deposit both ERC721 and ERC1155 tokens.
- **Withdraw with Signature** - Users can withdraw tokens with a valid signature from the contract owner. This provides an extra layer of security and control over the withdrawal process.
- **Withdrawal Fee** - Owners can set a withdrawal fee for specific deposits, which users must pay when withdrawing.
- **Emergency Batch Withdrawal** - The contract owner has the ability to transfer all deposited tokens to another address in case of an emergency.
- **Emergency ERC721 and ERC1155 Withdrawal** - The contract owner can move tokens to a different address if they were inadvertently deposited via transferFrom, a method that shouldn't be used for deposits.
- **Balance Withdrawal** - The contract owner can withdraw the contract's entire balance.
- **Used Signatures Tracking** - The contract ensures that a particular signature cannot be reused, preventing potential vulnerabilities.

## Events

- `TokenDeposited` - Emitted when a token is deposited into the contract.
- `TokenWithdrawn` - Emitted when a token is withdrawn from the contract.

## Functions

### Owner-only Functions

- `setWithdrawalFee(uint256 depositId, uint256 fee)` - Set the withdrawal fee for a specific deposit.
- `authorizeDepositor(address depositor)` - Authorizes an address to deposit tokens.
- `revokeDepositorAuthorization(address depositor)` - Revokes an address' authorization to deposit tokens.
- `emergencyBatchWithdrawal(uint256 startId, uint256 endId, address recipient)` - Allows the owner to withdraw tokens in a specified ID range in case of an emergency.
- `emergencyERC721Withdrawal(address tokenContract, uint256 tokenId, address recipient)` - Allows the owner to withdraw a specific ERC721 token in case of an emergency.
- `emergencyERC1155Withdrawal(address tokenContract, uint256 tokenId, uint256 amount, address recipient)` - Allows the owner to withdraw a specific ERC1155 token in case of an emergency.
- `withdrawEther(address recipient)` - Allows the owner to withdraw Ether from the contract.

### Public Functions

- `depositERC721(address tokenContract, uint256 tokenId)` - Deposit an ERC721 token.
- `depositERC1155(address tokenContract, uint256 tokenId)` - Deposit an ERC1155 token.
- `withdrawWithSignature(uint256 depositId, bytes memory signature, uint256 expiryBlockHeight)` - Withdraw a token with a valid signature from the contract owner.

### Interface Implementations

- `onERC721Received(address, address, uint256, bytes calldata)` - Implementation for ERC721 token reception.
- `onERC1155Received(address, address, uint256, uint256, bytes calldata)` - Implementation for ERC1155 token reception.
- `onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes calldata)` - This is intentionally set to revert as batch transfers are not supported.
- `supportsInterface(bytes4 interfaceId)` - Checks if the contract supports a specific interface.

### Installation

```
yarn
```

### Testing

```
yarn run test
```


### Usage

> **Warning**:
> If you manually transfer a token to the vault using a simple `transferFrom` without going through the provided deposit functions, the token will get to the vault, but the `depositId` won't be incremented since the internal logic of handling deposits won't be triggered. In this case the contract owner can call one the Emergency ERC721 or ERC1155 Withdrawal methods.

For ERC721:
1. Approve the vault contract for the token you want to deposit.
2. Call `depositERC721(tokenAddress, tokenId)` from the address that owns the token.
3. The token will be transferred to the vault, and the `onERC721Received` method will be triggered, leading to the incrementing of the `depositId`.

For ERC1155:
1. Set approval for the vault contract.
2. Call `depositERC1155(tokenAddress, tokenId)`.
3. The token will be transferred to the vault, and the `onERC1155Received` method will be triggered, leading to the incrementing of the `depositId`.


