const {expect} = require('chai');
const {ethers} = require('hardhat');
const {
	getSignature,
	setupERC721Deposit,
	setupERC1155Deposit,
} = require('../helpers');

describe('RedeemableTokenVault', function () {
	let vault, erc721, erc1155;
	const tokenId1 = 1;
	const tokenId2 = 2;

	beforeEach(async function () {
		[owner, addr1, addr2, signer] = await ethers.getSigners();

		// Stub contract deploy
		const ERC721 = await ethers.getContractFactory('ERC721Mock');
		erc721 = await ERC721.deploy('MockNFT', 'MNFT');
		await erc721.deployed();

		const ERC1155 = await ethers.getContractFactory('ERC1155Mock');
		erc1155 = await ERC1155.deploy(
			'https://yourtokenuri.com/api/token/{id}.json'
		);
		await erc1155.deployed();

		const Vault = await ethers.getContractFactory('RedeemableTokenVault');
		vault = await Vault.deploy();
		await vault.deployed();

		await vault.authorizeDepositor(addr1.address);

		await vault.setAuthorizedSigner(signer.address);
		
		await vault.authorizeContractDeposit(erc721.address);
		await vault.authorizeContractDeposit(erc1155.address);

		const currentBlockNum = await ethers.provider.getBlockNumber();

		expirationBlock = currentBlockNum + 40; // 4 ≈1min
	});

	describe('depositERC721', function () {
		it('Should deposit ERC721 token', async function () {
			await erc721.mint(addr1.address, tokenId1);
			await erc721.connect(addr1).approve(vault.address, tokenId1);

			await expect(
				vault.connect(addr1).depositERC721(erc721.address, tokenId1)
			).to.emit(vault, 'TokenDeposited');
		});

		it('Should not deposit ERC721 token if address is not in the isAllowed mapping', async function () {
			await erc721.mint(addr2.address, tokenId1);
			await erc721.connect(addr2).approve(vault.address, tokenId1);

			await expect(
				vault.connect(addr2).depositERC721(erc721.address, tokenId1)
			).to.rejectedWith('Depositor not authorized');
		});
		describe('revokeDepositorAuthorization', function () {
			it('Should remove authorized depositor address from the isAllowed mapping', async function () {
				await erc721.mint(addr1.address, tokenId1);
				await erc721.connect(addr1).approve(vault.address, tokenId1);
				await vault
					.connect(owner)
					.revokeDepositorAuthorization(addr1.address);
				await expect(
					vault.connect(addr1).depositERC721(erc721.address, tokenId1)
				).to.rejectedWith('Depositor not authorized');
			});
		});
		describe('authorizeDepositor', function () {
			it('Should add authorized depositor address in the isAllowed mapping', async function () {
				await erc721.mint(addr2.address, tokenId1);
				await erc721.connect(addr2).approve(vault.address, tokenId1);
				await vault.connect(owner).authorizeDepositor(addr2.address);
				await expect(
					vault.connect(addr2).depositERC721(erc721.address, tokenId1)
				).to.emit(vault, 'TokenDeposited');
			});
		});
	});

	describe('depositERC1155', function () {
		it('Should deposit ERC1155 token', async function () {
			await erc1155.mint(addr1.address, tokenId2, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);

			await expect(
				vault.connect(addr1).depositERC1155(erc1155.address, tokenId2)
			).to.emit(vault, 'TokenDeposited');
		});

		it('Should not deposit ERC1155 token if address is not in the isAllowed mapping', async function () {
			await erc1155.mint(addr2.address, tokenId2, 1, []);
			await erc1155
				.connect(addr2)
				.setApprovalForAll(vault.address, tokenId2);

			await expect(
				vault.connect(addr2).depositERC1155(erc1155.address, tokenId2)
			).to.rejectedWith('Depositor not authorized');
		});

		describe('revokeDepositorAuthorization', function () {
			it('Should remove authorized depositor address from the isAllowed mapping', async function () {
				await erc1155.mint(addr1.address, tokenId2, 1, []);
				await erc1155
					.connect(addr1)
					.setApprovalForAll(vault.address, tokenId2);
				await vault
					.connect(owner)
					.revokeDepositorAuthorization(addr1.address);
				await expect(
					vault
						.connect(addr1)
						.depositERC1155(erc1155.address, tokenId2)
				).to.rejectedWith('Depositor not authorized');
			});
		});

		describe('authorizeDepositor', function () {
			it('Should add authorized depositor address in the isAllowed mapping', async function () {
				await erc1155.mint(addr2.address, tokenId2, 1, []);
				await erc1155
					.connect(addr2)
					.setApprovalForAll(vault.address, tokenId2);
				await vault.connect(owner).authorizeDepositor(addr2.address);
				await expect(
					vault
						.connect(addr2)
						.depositERC1155(erc1155.address, tokenId2)
				).to.emit(vault, 'TokenDeposited');
			});
		});
	});

	describe('withdrawEther', function () {
		it('Should allow the owner to withdraw the entire balance', async () => {
			// First, send some ether to the contract
			const initialDeposit = ethers.utils.parseEther('1');
			await owner.sendTransaction({
				to: vault.address,
				value: initialDeposit,
			});

			// Check initial balance
			const initialBalance = await ethers.provider.getBalance(
				vault.address
			);
			expect(initialBalance).to.equal(initialDeposit);

			// Withdraw the balance
			const initialReceiverBalance = await ethers.provider.getBalance(
				owner.address
			);

			// Performing the withdrawal and capturing the transaction for gas calculations
			const tx = await vault.connect(owner).withdrawEther(owner.address);
			const newBalance = await ethers.provider.getBalance(vault.address);
			const newReceiverBalance = await ethers.provider.getBalance(
				owner.address
			);

			// assertAlmostEqual(
			// 	newReceiverBalance.sub(initialReceiverBalance),
			// 	initialDeposit
			// );

			const receipt = await tx.wait();
			const gasUsed = receipt.gasUsed;
			const gasPrice = tx.gasPrice;
			const totalGasCost = gasUsed.mul(gasPrice);
			expect(
				newReceiverBalance.sub(initialReceiverBalance).add(totalGasCost)
			).to.equal(initialDeposit);

			expect(newBalance).to.equal(0);
		});

		it('Should not allow unauthorized users to withdraw the balance', async () => {
			const initialDeposit = ethers.utils.parseEther('1');
			await owner.sendTransaction({
				to: vault.address,
				value: initialDeposit,
			});

			await expect(
				vault.connect(addr1).withdrawEther(addr2.address)
			).to.be.revertedWith('Ownable: caller is not the owner');
		});
	});

	describe('emergencyBatchWithdrawal', function () {
		it('should allow the owner to withdraw a range of tokens to another address', async function () {
			// Mint and deposit an ERC721
			await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);

			// // Mint and deposit 2 ERC1155 token with the same id
			await erc1155.mint(addr1.address, 2, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault.connect(addr1).depositERC1155(erc1155.address, 2);

			await erc1155.mint(addr1.address, 2, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault.connect(addr1).depositERC1155(erc1155.address, 2);

			// Get the current and next depositId to determine the range
			const startId = 1;
			const endId = 3;

			// Emergency withdraw for the range
			await vault
				.connect(owner)
				.emergencyBatchWithdrawal(startId, endId, owner.address);

			// Check that the receiver has received the tokens
			expect(await erc721.ownerOf(1)).to.equal(owner.address);
			expect(await erc1155.balanceOf(owner.address, 2)).to.equal(2);
		});

		it('should not allow non-owners to call emergencyBatchWithdrawal', async function () {
			const startId = 1;
			const endId = 2;

			await expect(
				vault
					.connect(addr1)
					.emergencyBatchWithdrawal(startId, endId, owner.address)
			).to.be.revertedWith('Ownable: caller is not the owner');
		});
	});

	describe('withdrawWithSignature', function () {
		it('Should allow ERC721 withdrawal with valid signature', async function () {
			const tokenId = 1;

			await setupERC721Deposit(addr1, vault, erc721, tokenId);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			await vault
				.connect(addr2)
				.withdrawWithSignature(depositId, signature, expirationBlock);

			expect(await erc721.ownerOf(depositId)).to.equal(addr2.address);
		});

		it('Should allow ERC1155 token withdrawal with valid signature', async function () {
			const tokenId = 2;
			const amount = 1;

			await setupERC1155Deposit(addr1, vault, erc1155, tokenId, amount);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			await vault
				.connect(addr2)
				.withdrawWithSignature(depositId, signature, expirationBlock);

			expect(await erc1155.balanceOf(addr2.address, tokenId)).to.equal(1);
		});

		it('Should allow withdraw of paid ERC721 tokens', async function () {
			const tokenId = 1;

			await setupERC721Deposit(addr1, vault, erc721, tokenId);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			const fee = ethers.utils.parseEther('0.1');

			// Set fees for the depositIds
			await vault.connect(owner).setWithdrawalFee(depositId, fee);

			await vault
				.connect(addr2)
				.withdrawWithSignature(depositId, signature, expirationBlock, {
					value: fee,
				});

			expect(await erc721.ownerOf(1)).to.equal(addr2.address);
		});

		it('Should allow withdraw of paid ERC1155 tokens', async function () {
			const tokenId = 2;
			const amount = 1;

			await setupERC1155Deposit(addr1, vault, erc1155, tokenId, amount);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			const fee = ethers.utils.parseEther('0.1');

			// Set fees for the depositIds
			await vault.connect(owner).setWithdrawalFee(depositId, fee);

			await vault
				.connect(addr2)
				.withdrawWithSignature(depositId, signature, expirationBlock, {
					value: fee,
				});

			expect(await erc1155.balanceOf(addr2.address, tokenId)).to.equal(1);
		});

		it('Should revert with invalid signature', async function () {
			const tokenId = 2;
			const amount = 1;

			await setupERC1155Deposit(addr1, vault, erc1155, tokenId, amount);

			const depositId = await vault.nextDepositId();

			const unauthorizedSigner = addr1

			const signature = getSignature(
				unauthorizedSigner,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			await expect(
				vault
					.connect(addr1)
					.withdrawWithSignature(
						depositId,
						signature,
						expirationBlock
					)
			).to.rejectedWith('Invalid signature');
		});

		it('Should revert on fake signature', async function () {
			const depositId = 1; // Just for this example

			const invalidSignature = '0x1234567890abcdef';

			await expect(
				vault
					.connect(addr1)
					.withdrawWithSignature(
						depositId,
						invalidSignature,
						expirationBlock
					)
			).to.rejectedWith('ECDSA: invalid signature length');
		});

		it('Should revert for already used signature', async function () {
			const tokenId = 1;

			await setupERC721Deposit(addr1, vault, erc721, tokenId);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);

			await vault
				.connect(addr2)
				.withdrawWithSignature(depositId, signature, expirationBlock);
			await expect(
				vault
					.connect(addr2)
					.withdrawWithSignature(
						depositId,
						signature,
						expirationBlock
					)
			).to.be.revertedWith('Signature already used');
		});

		it('Should revert for signature generated by another address', async function () {
			const tokenId = 1;

			await setupERC721Deposit(addr1, vault, erc721, tokenId);

			const depositId = await vault.nextDepositId();

			const unauthorizedSigner = addr2

			const signature = getSignature(
				unauthorizedSigner,
				addr1.address,
				depositId,
				expirationBlock,
				vault.address
			);

			await expect(
				vault
					.connect(addr1)
					.withdrawWithSignature(
						depositId,
						signature,
						expirationBlock
					)
			).to.be.revertedWith('Invalid signature');
		});

		it('Should not allow withdraw of paid ERC721 tokens with 0 eth', async function () {
			const tokenId = 1;

			await setupERC721Deposit(addr1, vault, erc721, tokenId);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr1.address,
				depositId,
				expirationBlock,
				vault.address
			);

			const fee = ethers.utils.parseEther('0.1');

			// Set fees for the depositIds
			await vault.connect(owner).setWithdrawalFee(depositId, fee);

			await expect(
				vault
					.connect(addr2)
					.withdrawWithSignature(
						depositId,
						signature,
						expirationBlock
					)
			).to.revertedWith('Insufficient fee paid');
		});

		it('Should not allow withdraw of paid ERC1155 tokens with 0 eth', async function () {
			const tokenId = 2;
			const amount = 1;

			await setupERC1155Deposit(addr1, vault, erc1155, tokenId, amount);

			const depositId = await vault.nextDepositId();

			const signature = getSignature(
				signer,
				addr2.address,
				depositId,
				expirationBlock,
				vault.address
			);
			
			const fee = ethers.utils.parseEther('0.1');

			// Set fees for the depositIds
			await vault.connect(owner).setWithdrawalFee(depositId, fee);

			await expect(
				vault
					.connect(addr2)
					.withdrawWithSignature(
						depositId,
						signature,
						expirationBlock
					)
			).to.revertedWith('Insufficient fee paid');
		});
	});

	describe('safeTransfers and Withdrawals', function () {

		it('should only allow safeTransfer one token at a time', async function () {
			// Mint a token to addr1 and approve the vault
			await erc1155.connect(addr1).mint(addr1.address, 1, 2, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);

			
			// Deposit one token and expect it to be successful
			await erc1155
				.connect(addr1)
				.safeTransferFrom(addr1.address, vault.address, 1, 1, []);
			expect(await erc1155.balanceOf(vault.address, 1)).to.equal(1);
		});
	});

	describe('transferFrom edge cases', function () {
		it('should allow emergency withdrawal for ERC721 tokens', async function () {
			await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await erc721
				.connect(addr1)
				.transferFrom(addr1.address, vault.address, 1);
			expect(await erc721.ownerOf(1)).to.equal(vault.address);

			// Perform the emergency withdrawal
			await vault
				.connect(owner)
				.emergencyERC721Withdrawal(erc721.address, 1, addr2.address);
			expect(await erc721.ownerOf(1)).to.equal(addr2.address);
		});

		it('should allow emergency withdrawal for ERC1155 tokens', async function () {
			await erc1155.connect(addr1).mint(addr1.address, 1, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await erc1155
				.connect(addr1)
				.safeTransferFrom(addr1.address, vault.address, 1, 1, []);
			expect(await erc1155.balanceOf(vault.address, 1)).to.equal(1);

			// Perform the emergency withdrawal
			await vault
				.connect(owner)
				.emergencyERC1155Withdrawal(
					erc1155.address,
					1,
					1,
					addr2.address
				);
			expect(await erc1155.balanceOf(addr2.address, 1)).to.equal(1);
		});
	});
	
});
