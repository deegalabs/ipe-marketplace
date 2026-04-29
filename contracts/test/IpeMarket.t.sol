// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IpeMarket} from "../src/IpeMarket.sol";
import {MockIPE} from "../src/MockIPE.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract IpeMarketTest is Test {
    IpeMarket internal market;
    MockIPE internal ipe;
    MockUSDC internal usdc;

    address internal owner = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal alice = address(0xA);
    address internal bob = address(0xB);

    uint256 internal constant PRICE_IPE = 50 ether;        // 18 decimals
    uint256 internal constant PRICE_USDC = 30 * 1e6;       // 6 decimals
    uint96 internal constant ROYALTY_BPS = 500;            // 5%

    function setUp() public {
        vm.startPrank(owner);
        ipe = new MockIPE(owner);
        usdc = new MockUSDC(owner);
        market = new IpeMarket(treasury, owner);
        market.setAcceptedToken(address(ipe), true);
        market.setAcceptedToken(address(usdc), true);
        vm.stopPrank();

        vm.prank(owner);
        ipe.mint(alice, 1_000 ether);
        vm.prank(owner);
        ipe.mint(bob, 1_000 ether);
        vm.prank(owner);
        usdc.mint(alice, 1_000 * 1e6);
        vm.prank(owner);
        usdc.mint(bob, 1_000 * 1e6);
    }

    function _listProduct(uint256 maxSupply) internal returns (uint256 productId) {
        address[] memory tokens = new address[](2);
        tokens[0] = address(ipe);
        tokens[1] = address(usdc);
        uint256[] memory tokenPrices = new uint256[](2);
        tokenPrices[0] = PRICE_IPE;
        tokenPrices[1] = PRICE_USDC;

        vm.prank(owner);
        productId = market.listProduct(maxSupply, ROYALTY_BPS, "ipfs://t-shirt", tokens, tokenPrices);
    }

    // ─── token whitelist ───────────────────────────────────────

    function test_setAcceptedToken_revertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(IpeMarket.InvalidToken.selector);
        market.setAcceptedToken(address(0), true);
    }

    function test_setAcceptedToken_emitsAndStoresFlag() public {
        address fake = address(0xDEAD);
        vm.expectEmit(true, false, false, true);
        emit IpeMarket.TokenAccepted(fake, true);
        vm.prank(owner);
        market.setAcceptedToken(fake, true);
        assertTrue(market.acceptedTokens(fake));
    }

    // ─── product CRUD ──────────────────────────────────────────

    function test_listProduct_setsRoyaltyAndPrices() public {
        uint256 pid = _listProduct(0);

        (address receiver, uint256 amount) = market.royaltyInfo(pid, 100 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 5 ether); // 5%

        assertEq(market.prices(pid, address(ipe)), PRICE_IPE);
        assertEq(market.prices(pid, address(usdc)), PRICE_USDC);
    }

    function test_listProduct_revertsOnExcessiveRoyalty() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(ipe);
        uint256[] memory tokenPrices = new uint256[](1);
        tokenPrices[0] = PRICE_IPE;

        vm.prank(owner);
        vm.expectRevert(IpeMarket.RoyaltyTooHigh.selector);
        market.listProduct(0, 1_001, "ipfs://x", tokens, tokenPrices);
    }

    function test_listProduct_revertsOnUnacceptedToken() public {
        address fake = address(0xDEAD);
        address[] memory tokens = new address[](1);
        tokens[0] = fake;
        uint256[] memory tokenPrices = new uint256[](1);
        tokenPrices[0] = PRICE_IPE;

        vm.prank(owner);
        vm.expectRevert(IpeMarket.TokenNotAccepted.selector);
        market.listProduct(0, ROYALTY_BPS, "ipfs://x", tokens, tokenPrices);
    }

    function test_listProduct_revertsOnLengthMismatch() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(ipe);
        tokens[1] = address(usdc);
        uint256[] memory tokenPrices = new uint256[](1);
        tokenPrices[0] = PRICE_IPE;

        vm.prank(owner);
        vm.expectRevert(IpeMarket.LengthMismatch.selector);
        market.listProduct(0, ROYALTY_BPS, "ipfs://x", tokens, tokenPrices);
    }

    function test_setPrice_addsNewTokenToExistingProduct() public {
        uint256 pid = _listProduct(0);
        // disable IPE for this product
        vm.prank(owner);
        market.setPrice(pid, address(ipe), 0);
        assertEq(market.prices(pid, address(ipe)), 0);
    }

    function test_updateProduct_changesActiveAndUri() public {
        uint256 pid = _listProduct(0);
        vm.prank(owner);
        market.updateProduct(pid, false, "ipfs://new");
        (, bool active, string memory u) = market.products(pid);
        assertFalse(active);
        assertEq(u, "ipfs://new");
    }

    // ─── primary sale (crypto) ─────────────────────────────────

    function test_buyWithIPE_transfersToTreasuryAndMints() public {
        uint256 pid = _listProduct(0);

        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE);
        market.buy(pid, 1, address(ipe));
        vm.stopPrank();

        assertEq(ipe.balanceOf(treasury), PRICE_IPE);
        assertEq(market.balanceOf(alice, pid), 1);
        assertEq(market.totalSupply(pid), 1);
    }

    function test_buyWithUSDC_transfersToTreasuryAndMints() public {
        uint256 pid = _listProduct(0);

        vm.startPrank(alice);
        usdc.approve(address(market), PRICE_USDC);
        market.buy(pid, 1, address(usdc));
        vm.stopPrank();

        assertEq(usdc.balanceOf(treasury), PRICE_USDC);
        assertEq(market.balanceOf(alice, pid), 1);
    }

    function test_buy_revertsOnUnacceptedToken() public {
        uint256 pid = _listProduct(0);
        address fake = address(0xDEAD);

        vm.prank(alice);
        vm.expectRevert(IpeMarket.TokenNotAccepted.selector);
        market.buy(pid, 1, fake);
    }

    function test_buy_revertsWhenPriceNotSetForToken() public {
        // list with IPE only
        address[] memory tokens = new address[](1);
        tokens[0] = address(ipe);
        uint256[] memory tokenPrices = new uint256[](1);
        tokenPrices[0] = PRICE_IPE;

        vm.prank(owner);
        uint256 pid = market.listProduct(0, ROYALTY_BPS, "ipfs://x", tokens, tokenPrices);

        // try to buy with USDC (whitelisted, but no price set for this product)
        vm.prank(alice);
        vm.expectRevert(IpeMarket.PriceNotSetForToken.selector);
        market.buy(pid, 1, address(usdc));
    }

    function test_buy_respectsMaxSupply() public {
        uint256 pid = _listProduct(2);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE * 3);
        market.buy(pid, 2, address(ipe));
        vm.expectRevert(IpeMarket.MaxSupplyExceeded.selector);
        market.buy(pid, 1, address(ipe));
        vm.stopPrank();
    }

    function test_buy_revertsOnZeroQuantity() public {
        uint256 pid = _listProduct(0);
        vm.prank(alice);
        vm.expectRevert(IpeMarket.InvalidQuantity.selector);
        market.buy(pid, 0, address(ipe));
    }

    // ─── primary sale (fiat — mintTo) ──────────────────────────

    function test_mintTo_ownerMintsAndEmits() public {
        uint256 pid = _listProduct(0);
        bytes32 ref = keccak256("asaas:pay_abc123");

        vm.expectEmit(true, true, false, true);
        emit IpeMarket.FiatMinted(alice, pid, 2, ref);
        vm.prank(owner);
        market.mintTo(alice, pid, 2, ref);

        assertEq(market.balanceOf(alice, pid), 2);
    }

    function test_mintTo_revertsForNonOwner() public {
        uint256 pid = _listProduct(0);
        vm.prank(alice);
        vm.expectRevert();
        market.mintTo(alice, pid, 1, bytes32(0));
    }

    function test_mintTo_respectsMaxSupply() public {
        uint256 pid = _listProduct(2);
        vm.startPrank(owner);
        market.mintTo(alice, pid, 2, bytes32(0));
        vm.expectRevert(IpeMarket.MaxSupplyExceeded.selector);
        market.mintTo(alice, pid, 1, bytes32(0));
        vm.stopPrank();
    }

    // ─── redeem ────────────────────────────────────────────────

    function test_redeem_burnsHolderTokens() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE);
        market.buy(pid, 1, address(ipe));
        market.redeem(alice, pid, 1);
        vm.stopPrank();

        assertEq(market.balanceOf(alice, pid), 0);
    }

    function test_redeem_ownerCanBurnOnDelivery() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE);
        market.buy(pid, 1, address(ipe));
        vm.stopPrank();

        vm.prank(owner);
        market.redeem(alice, pid, 1);
        assertEq(market.balanceOf(alice, pid), 0);
    }

    function test_redeem_revertsForUnrelatedCaller() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE);
        market.buy(pid, 1, address(ipe));
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(IpeMarket.NotSeller.selector);
        market.redeem(alice, pid, 1);
    }

    // ─── resale ────────────────────────────────────────────────

    function _aliceBuysOne(uint256 pid) internal {
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE_IPE);
        market.buy(pid, 1, address(ipe));
        vm.stopPrank();
    }

    function test_listForResale_escrowsTheUnit() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.prank(alice);
        uint256 lid = market.listForResale(pid, 1, address(ipe), 80 ether);

        assertEq(market.balanceOf(alice, pid), 0);
        assertEq(market.balanceOf(address(market), pid), 1);
        (address seller,, uint256 quantity, address ptoken, uint256 price, bool active) = market.listings(lid);
        assertEq(seller, alice);
        assertEq(quantity, 1);
        assertEq(ptoken, address(ipe));
        assertEq(price, 80 ether);
        assertTrue(active);
    }

    function test_buyResale_paysSellerNetOfRoyaltyAndTreasuryGetsRoyalty() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.prank(alice);
        uint256 lid = market.listForResale(pid, 1, address(ipe), 100 ether);

        uint256 aliceBefore = ipe.balanceOf(alice);
        uint256 treasuryBefore = ipe.balanceOf(treasury);

        vm.startPrank(bob);
        ipe.approve(address(market), 100 ether);
        market.buyResale(lid, 1);
        vm.stopPrank();

        assertEq(market.balanceOf(bob, pid), 1);
        assertEq(ipe.balanceOf(alice) - aliceBefore, 95 ether); // 100 - 5% royalty
        assertEq(ipe.balanceOf(treasury) - treasuryBefore, 5 ether);
    }

    function test_buyResale_inUSDC() public {
        uint256 pid = _listProduct(0);

        vm.startPrank(alice);
        usdc.approve(address(market), PRICE_USDC);
        market.buy(pid, 1, address(usdc));
        uint256 lid = market.listForResale(pid, 1, address(usdc), 50 * 1e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(market), 50 * 1e6);
        market.buyResale(lid, 1);
        vm.stopPrank();

        assertEq(market.balanceOf(bob, pid), 1);
    }

    function test_listForResale_revertsOnUnacceptedToken() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.prank(alice);
        vm.expectRevert(IpeMarket.TokenNotAccepted.selector);
        market.listForResale(pid, 1, address(0xDEAD), 80 ether);
    }

    function test_cancelResale_returnsUnits() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.startPrank(alice);
        uint256 lid = market.listForResale(pid, 1, address(ipe), 80 ether);
        market.cancelResale(lid);
        vm.stopPrank();

        assertEq(market.balanceOf(alice, pid), 1);
        assertEq(market.balanceOf(address(market), pid), 0);
    }

    // ─── treasury ──────────────────────────────────────────────

    function test_withdraw_movesIPEFromContract() public {
        vm.prank(owner);
        ipe.mint(address(market), 10 ether);

        uint256 ownerBefore = ipe.balanceOf(owner);
        vm.prank(owner);
        market.withdraw(address(ipe), owner, 10 ether);

        assertEq(ipe.balanceOf(address(market)), 0);
        assertEq(ipe.balanceOf(owner), ownerBefore + 10 ether);
    }

    function test_setTreasury_updatesAndEmits() public {
        address newTreasury = address(0xCAFE);
        vm.expectEmit(true, true, false, false);
        emit IpeMarket.TreasuryUpdated(treasury, newTreasury);
        vm.prank(owner);
        market.setTreasury(newTreasury);
        assertEq(market.treasury(), newTreasury);
    }
}
