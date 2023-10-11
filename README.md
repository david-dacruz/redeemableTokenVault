# RedeemableTokenVault README

## Overview

The `RedeemableTokenVault` contract facilitates the depositing of both ERC721 and ERC1155 tokens. Authorized addresses are permitted to deposit tokens, while other users can withdraw these tokens using a valid signature from the contract owner.

## Key Features

- **Deposit** - Authorized addresses can deposit both ERC721 and ERC1155 tokens.
- **Withdraw with Signature** - Users can withdraw tokens with a valid signature from the contract owner. This provides an extra layer of security and control over the withdrawal process.
- **Withdrawal Fee** - Owners can set a withdrawal fee for specific deposits, which users must pay when withdrawing.
- **Emergency Withdrawal** - The contract owner has the ability to transfer all deposited tokens to another address in case of an emergency.
- **Balance Withdrawal** - The contract owner can withdraw the contract's entire balance.
- **Used Signatures Tracking** - The contract ensures that a particular signature cannot be reused, preventing potential vulnerabilities.
  
## Events

- `Deposited` - Emitted when a token is deposited into the contract.
- `Withdrawn` - Emitted when a token is withdrawn from the contract.

## Functions

### Owner-only Functions

- `setWithdrawalFeeForDeposit(uint256 _depositId, uint256 fee)` - Set the withdrawal fee for a specific deposit.
- `addToAllowedList(address user)` - Add an address to the list of those authorized to deposit tokens.
- `removeFromAllowedList(address user)` - Remove an address from the list of those authorized to deposit tokens.
- `emergencyWithdrawAll(address receiver)` - Transfer all vaulted tokens to another address in case of an emergency.
- `withdrawBalance(address receiver)` - Allows the owner to withdraw the contract's entire balance.

### Public Functions

- `depositERC721(address tokenAddress, uint256 tokenId)` - Deposit an ERC721 token.
- `depositERC1155(address tokenAddress, uint256 tokenId)` - Deposit an ERC1155 token.
- `withdrawWithSignature(uint256 _depositId, bytes memory _signature, uint256 _expiryBlockHeight)` - Withdraw a token with a valid signature from the contract owner.
  
### Interface Implementations

- `onERC721Received(address, address, uint256, bytes memory)` - Implementation for ERC721 token reception.
- `onERC1155Received(address, address, uint256, uint256, bytes memory)` - Implementation for ERC1155 token reception.
- `onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)` - This is intentionally set to revert as batch transfers are not supported.
- `supportsInterface(bytes4 interfaceId)` - Checks if the contract supports a specific interface.

### Installation
```
    yarn
```

### Testing
```
    yarn run test
```
