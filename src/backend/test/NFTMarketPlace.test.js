/** @format */

const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);

describe("NFTMarketPlace", () => {
    let deployer, addr1, addr2, nft, marketPlace;
    let feePercent = 1;
    let URI = "Sample URI";
    beforeEach(async () => {
        const NFT = await ethers.getContractFactory("NFT");
        const MarketPlace = await ethers.getContractFactory("MarketPlace");

        [deployer, addr1, addr2] = await ethers.getSigners();

        nft = await NFT.deploy();
        marketPlace = await MarketPlace.deploy(feePercent);
    });

    describe("Deployment", () => {
        it("Should track name amd symbol of the nft collection", async () => {
            expect(await nft.name()).to.equal("DApp NFT");
            expect(await nft.symbol()).to.equal("DAPP");
        });

        it("Should track feeAccount amd feePercent of the marketPlace", async () => {
            expect(await marketPlace.feeAccount()).to.equal(deployer.address);
            expect(await marketPlace.feePercent()).to.equal(feePercent);
        });
    });

    describe("Minting NFTs", () => {
        it("Should track each minted NFT", async () => {
            await nft.connect(addr1).mint(URI);
            expect(await nft.tokenCount()).to.equal(1);
            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.tokenURI(1)).to.equal(URI);

            await nft.connect(addr2).mint(URI);
            expect(await nft.tokenCount()).to.equal(2);
            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.tokenURI(2)).to.equal(URI);
        });
    });

    describe("Making marketplace items", () => {
        beforeEach(async () => {
            await nft.connect(addr1).mint(URI);

            await nft
                .connect(addr1)
                .setApprovalForAll(marketPlace.address, true);
        });

        it("Should track newly created item, transfer NFT from seller to marketplace and emit Offered event", async () => {
            await expect(
                marketPlace.connect(addr1).makeItem(nft.address, 1, toWei(1))
            )
                .to.emit(marketPlace, "Offered")
                .withArgs(1, nft.address, 1, toWei(1), addr1.address);

            expect(await nft.ownerOf(1)).to.equal(marketPlace.address);

            expect(await marketPlace.itemCount()).to.equal(1);

            const item = await marketPlace.items(1);
            expect(item.itemId).to.equal(1);
            expect(item.nft).to.equal(nft.address);
            expect(item.tokenId).to.equal(1);
            expect(item.price).to.equal(toWei(1));
            expect(item.sold).to.equal(false);
        });

        it("Should fail if price is set to zero", async () => {
            await expect(
                marketPlace.connect(addr1).makeItem(nft.address, 1, 0)
            ).to.be.revertedWith("Price must be greather than zero");
        });
    });

    describe("Purchasing marketplace items", () => {
        let price = 2;
        beforeEach(async () => {
            await nft.connect(addr1).mint(URI);

            await nft
                .connect(addr1)
                .setApprovalForAll(marketPlace.address, true);

            await marketPlace.connect(addr1).makeItem(nft.address, 1, toWei(2));
        });

        it("Should update item as sold, pay seller, transfer NFT to buyer, charge fees and emit a Bought event", async () => {
            const sellerInitialEthBalance = await addr1.getBalance();
            const feeAccountInitialEthBalance = await deployer.getBalance();

            let totalPriceInWei = await marketPlace.getTotalPrice(1);

            await expect(
                marketPlace
                    .connect(addr2)
                    .purchaseItem(1, { value: totalPriceInWei })
            )
                .to.emit(marketPlace, "Bought")
                .withArgs(
                    1,
                    nft.address,
                    1,
                    toWei(price),
                    addr1.address,
                    addr2.address
                );

            const sellerFinalEthBalance = await addr1.getBalance();
            const feeAccountFinalEthBalance = await addr2.getBalance();
            console.log(price);
            expect(+fromWei(sellerFinalEthBalance)).to.equal(
                +price + +fromWei(sellerInitialEthBalance)
            );

            const fee = (feePercent / 100) * price;

            expect(+fromWei(feeAccountFinalEthBalance)).to.equal(
                +fee + +fromWei(feeAccountInitialEthBalance)
            );

            expect(await nft.ownerOf(1)).to.equal(addr2.address);

            expect((await marketPlace.items(1)).sold).to.equal(true);
        });
    });
});
