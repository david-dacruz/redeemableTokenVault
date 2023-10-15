async function getSignature(signer, withdrawerAddress, depositId, expirationBlock, vaultAddress) {
    const message = ethers.utils.solidityKeccak256(
        ['address', 'uint256', 'uint256', 'address'],
        [withdrawerAddress, depositId, expirationBlock, vaultAddress]
    );
    return await signer.signMessage(ethers.utils.arrayify(message));
}

async function setupERC721Deposit(depositor, vault, erc721, tokenId) {
    await erc721.connect(depositor).mint(depositor.address, tokenId);
    await erc721.connect(depositor).approve(vault.address, tokenId);
    await vault.connect(depositor).depositERC721(erc721.address, tokenId);
}

async function setupERC1155Deposit(depositor, vault, erc1155, tokenId, amount) {
    await erc1155.connect(depositor).mint(depositor.address, tokenId, amount, []);
    await erc1155.connect(depositor).setApprovalForAll(vault.address, true);
    await vault.connect(depositor).depositERC1155(erc1155.address, tokenId);
}

module.exports = {
    getSignature,
    setupERC1155Deposit,
    setupERC721Deposit
}
