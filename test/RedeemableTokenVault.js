const {expect} = require('chai');
const {ethers} = require('hardhat');
const {sign} = require('crypto');

describe('RedeemableTokenVault', function () {
	let vault, erc721, erc1155, owner, addr1, addr2;
	const tokenId1 = 1;
	const tokenId2 = 2;

	beforeEach(async function () {
		[owner, addr1, addr2] = await ethers.getSigners();

		// Stub contract deploy
		const ERC721 = await ethers.getContractFactory('ERC721Mock');
		erc721 = await ERC721.deploy('MockNFT', 'MNFT'); // added name and symbol
		await erc721.deployed();

		const ERC1155 = await ethers.getContractFactory('ERC1155Mock');
		erc1155 = await ERC1155.deploy(
			'https://yourtokenuri.com/api/token/{id}.json'
		); // URI pattern (or whatever your mock expects)
		await erc1155.deployed();

		// Vault contract deploy
		const Vault = await ethers.getContractFactory('RedeemableTokenVault');
		vault = await Vault.deploy();
		await vault.deployed();

		// Allow addr1 to deposit tokens in the vault
        await vault.addToAllowedList(addr1.address);
        
        const currentBlockNum = await ethers.provider.getBlockNumber();

        expirationBlock = currentBlockNum + 40; // 4 ≈1min
	});

	describe('depositERC721', function () {
		it('Should deposit ERC721 token', async function () {
			await erc721.mint(addr1.address, tokenId1);
			await erc721.connect(addr1).approve(vault.address, tokenId1);

			await expect(
				vault.connect(addr1).depositERC721(erc721.address, tokenId1)
			).to.emit(vault, 'Deposited');
		});

		it('Should not deposit ERC721 token if address is not in the isAllowed mapping', async function () {
			await erc721.mint(addr2.address, tokenId1);
			await erc721.connect(addr2).approve(vault.address, tokenId1);

			await expect(
				vault.connect(addr2).depositERC721(erc721.address, tokenId1)
			).to.rejectedWith('Not authorized to deposit');
		});
		describe('removeFromAllowedList', function () {
			it('Should remove authorized depositor address from the isAllowed mapping', async function () {
				await erc721.mint(addr1.address, tokenId1);
				await erc721.connect(addr1).approve(vault.address, tokenId1);
				await vault.connect(owner).removeFromAllowedList(addr1.address);
				await expect(
					vault.connect(addr1).depositERC721(erc721.address, tokenId1)
				).to.rejectedWith('Not authorized to deposit');
			});
		});
		describe('addToAllowedList', function () {
			it('Should add authorized depositor address in the isAllowed mapping', async function () {
				await erc721.mint(addr2.address, tokenId1);
				await erc721.connect(addr2).approve(vault.address, tokenId1);
				await vault.connect(owner).addToAllowedList(addr2.address);
				await expect(
					vault.connect(addr2).depositERC721(erc721.address, tokenId1)
				).to.emit(vault, 'Deposited');
			});
		});
	});

	describe('depositERC1155', function () {
		it('Should deposit ERC1155 token', async function () {
			await erc1155.mint(addr1.address, tokenId2, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);

			await expect(
				vault
					.connect(addr1)
					.depositERC1155(erc1155.address, tokenId2)
			).to.emit(vault, 'Deposited');
		});

		it('Should not deposit ERC1155 token if address is not in the isAllowed mapping', async function () {
			await erc1155.mint(addr2.address, tokenId2, 1, []);
			await erc1155
				.connect(addr2)
				.setApprovalForAll(vault.address, tokenId2);

			await expect(
				vault
					.connect(addr2)
					.depositERC1155(erc1155.address, tokenId2)
			).to.rejectedWith('Not authorized to deposit');
		});

		describe('removeFromAllowedList', function () {
			it('Should remove authorized depositor address from the isAllowed mapping', async function () {
				await erc1155.mint(addr1.address, tokenId2, 1, []);
				await erc1155
					.connect(addr1)
					.setApprovalForAll(vault.address, tokenId2);
				await vault.connect(owner).removeFromAllowedList(addr1.address);
				await expect(
					vault
						.connect(addr1)
						.depositERC1155(erc1155.address, tokenId2)
				).to.rejectedWith('Not authorized to deposit');
			});
		});

		describe('addToAllowedList', function () {
			it('Should add authorized depositor address in the isAllowed mapping', async function () {
				await erc1155.mint(addr2.address, tokenId2, 1, []);
				await erc1155
					.connect(addr2)
					.setApprovalForAll(vault.address, tokenId2);
				await vault.connect(owner).addToAllowedList(addr2.address);
				await expect(
					vault
						.connect(addr2)
						.depositERC1155(erc1155.address, tokenId2)
				).to.emit(vault, 'Deposited');
			});
		});
	});

	describe('withdrawBalance', function () {
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
				addr1.address
			);
			await vault.connect(owner).withdrawBalance(addr1.address);
			const newBalance = await ethers.provider.getBalance(vault.address);
			const newReceiverBalance = await ethers.provider.getBalance(
				addr1.address
			);

			expect(newBalance).to.equal(0);
			expect(newReceiverBalance.sub(initialReceiverBalance)).to.equal(
				initialDeposit
			);
		});

		it('Should not allow unauthorized users to withdraw the balance', async () => {
			const initialDeposit = ethers.utils.parseEther('1');
			await owner.sendTransaction({
				to: vault.address,
				value: initialDeposit,
			});

			await expect(
				vault.connect(addr1).withdrawBalance(addr2.address)
			).to.be.revertedWith('Ownable: caller is not the owner');
		});
	});

	describe('emergencyWithdrawRange', function () {
		it('should allow the owner to withdraw a range of tokens to another address', async function () {
			// Mint and deposit an ERC721
			await erc721.mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);
	
			// Mint and deposit an ERC1155
			await erc1155.mint(addr1.address, 2, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault.connect(addr1).depositERC1155(erc1155.address, 2);
	
			// Get the current and next depositId to determine the range
			const startId = 1;
			const endId = 2;
	
			// Emergency withdraw for the range
			await vault.connect(owner).emergencyWithdrawRange(startId, endId, owner.address);
	
			// Check that the receiver has received the tokens
			expect(await erc721.ownerOf(1)).to.equal(owner.address);
			expect(await erc1155.balanceOf(owner.address, 2)).to.equal(1);
		});
	
		it('should not allow non-owners to call emergencyWithdrawRange', async function () {
			const startId = 1;
			const endId = 2;
	
			await expect(
				vault.connect(addr1).emergencyWithdrawRange(startId, endId, owner.address)
			).to.be.revertedWith('Ownable: caller is not the owner');
		});
	});
	

	describe('withdrawWithSignature', function () {
		it('Should allow ERC721 withdrawal with valid signature', async function () {
			await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);

            const depositId = 1;

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await vault
				.connect(addr1)
				.withdrawWithSignature(depositId, signature, expirationBlock);

			expect(await erc721.ownerOf(1)).to.equal(addr1.address);
		});

		it('Should allow ERC1155 token withdrawal with valid signature', async function () {
			const tokenId = 2;

			await erc1155
				.connect(addr1)
				.mint(addr1.address, tokenId, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault
				.connect(addr1)
				.depositERC1155(erc1155.address, tokenId);

			const depositId = 1;

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await vault
				.connect(addr1)
                .withdrawWithSignature(depositId, signature, expirationBlock)
            
			expect(await erc1155.balanceOf(addr1.address, tokenId)).to.equal(
				1
			);
        });
        
        it('Should allow withdraw of paid ERC721 tokens', async function () {
            await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);
            
            const depositId = 1;
			const fee = ethers.utils.parseEther('0.1');
            
            // Set fees for the depositIds
            await vault
            .connect(owner)
            .setWithdrawalFeeForDeposit(depositId, fee);

			await owner.sendTransaction({
				to: vault.address,
				value: fee,
			});

			await vault.setWithdrawalFeeForDeposit(depositId, fee);

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await vault
                .connect(addr1)
                .withdrawWithSignature(depositId, signature, expirationBlock, {value: fee})

			expect(await erc721.ownerOf(1)).to.equal(addr1.address);
		});

		it('Should allow withdraw of paid ERC1155 tokens', async function () {
			const tokenId = 2;

			await erc1155
				.connect(addr1)
				.mint(addr1.address, tokenId, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault
				.connect(addr1)
				.depositERC1155(erc1155.address, tokenId);

            
            const depositId = 1;
			const fee = ethers.utils.parseEther('0.1');
            
            // Set fees for the depositIds
            await vault
            .connect(owner)
            .setWithdrawalFeeForDeposit(depositId, fee);
            
			await owner.sendTransaction({
				to: vault.address,
				value: fee,
			});

			await vault.setWithdrawalFeeForDeposit(depositId, fee);

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await vault
				.connect(addr1)
                .withdrawWithSignature(depositId, signature, expirationBlock, {value: fee})

			expect(await erc1155.balanceOf(addr1.address, tokenId)).to.equal(
				1
			);
		});
		
        it('Should revert with invalid signature', async function () {
            const tokenId = 2;

            await erc1155
                .connect(addr1)
                .mint(addr1.address, tokenId, 1, []);
            await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
            await vault
                .connect(addr1)
                .depositERC1155(erc1155.address, tokenId);

            const depositId = 1;

            const message = ethers.utils.solidityKeccak256(
                ['address', 'uint256', 'uint256'],
                [addr1.address, depositId, expirationBlock]
            );
            const signature = await addr2.signMessage(
                ethers.utils.arrayify(message)
            );

            await expect(vault
                .connect(addr1)
                .withdrawWithSignature(depositId, signature, expirationBlock)).to.rejectedWith('Invalid signature')
		});

		it('Should revert on fake signature', async function () {
			const depositId = 1; // Just for this example

			const invalidSignature = '0x1234567890abcdef';

			await expect(
				vault
					.connect(addr1)
                    .withdrawWithSignature(depositId, invalidSignature, expirationBlock)
            ).to.rejectedWith('ECDSA: invalid signature length')
		});

		it('Should revert for already used signature', async function () {
			await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);

			const depositId = 1;

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await vault
				.connect(addr1)
                .withdrawWithSignature(depositId, signature, expirationBlock)
			await expect(
				vault.connect(addr1).withdrawWithSignature(depositId, signature, expirationBlock)
			).to.be.revertedWith('Signature has already been used');
		});

		it('Should revert for signature generated by another address', async function () {
			const depositId = 1;

			const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await addr2.signMessage(
				ethers.utils.arrayify(message)
			); // Signed by another address

			await expect(
				vault.connect(addr1).withdrawWithSignature(depositId, signature, expirationBlock)
			).to.be.revertedWith('Invalid signature');
		});
	
        it('Should not allow withdraw of paid ERC721 tokens with 0 eth', async function () {
            await erc721.connect(addr1).mint(addr1.address, 1);
			await erc721.connect(addr1).approve(vault.address, 1);
			await vault.connect(addr1).depositERC721(erc721.address, 1);
            
            const depositId = 1;
			const fee = ethers.utils.parseEther('0.1');
            
            // Set fees for the depositIds
            await vault
            .connect(owner)
            .setWithdrawalFeeForDeposit(depositId, fee);

			await owner.sendTransaction({
				to: vault.address,
				value: fee,
			});

			await vault.setWithdrawalFeeForDeposit(depositId, fee);

            const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

			await expect(vault
				.connect(addr1)
				.withdrawWithSignature(depositId, signature, expirationBlock)).to.revertedWith('Insufficient fee paid')
		});

		it('Should not allow withdraw of paid ERC1155 tokens with 0 eth', async function () {
			const tokenId = 2;

			await erc1155
				.connect(addr1)
				.mint(addr1.address, tokenId, 1, []);
			await erc1155.connect(addr1).setApprovalForAll(vault.address, true);
			await vault
				.connect(addr1)
				.depositERC1155(erc1155.address, tokenId);

            
            const depositId = 1;
			const fee = ethers.utils.parseEther('0.1');
            
            // Set fees for the depositIds
            await vault
            .connect(owner)
            .setWithdrawalFeeForDeposit(depositId, fee);
            
			await owner.sendTransaction({
				to: vault.address,
				value: fee,
			});

			await vault.setWithdrawalFeeForDeposit(depositId, fee);

            const message = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256'],
				[addr1.address, depositId, expirationBlock]
			);
			const signature = await owner.signMessage(
				ethers.utils.arrayify(message)
			);

            await expect(vault
				.connect(addr1)
				.withdrawWithSignature(depositId, signature, expirationBlock)).to.revertedWith('Insufficient fee paid')
		});
	});
});
