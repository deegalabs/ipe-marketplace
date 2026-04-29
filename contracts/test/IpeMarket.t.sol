// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IpeMarket} from "../src/IpeMarket.sol";
import {MockIPE} from "../src/MockIPE.sol";

contract IpeMarketTest is Test {
    IpeMarket internal market;
    MockIPE internal ipe;

    address internal owner = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal alice = address(0xA);
    address internal bob = address(0xB);

    uint256 internal constant PRICE = 50 ether;
    uint96 internal constant ROYALTY_BPS = 500; // 5%

    function setUp() public {
        vm.startPrank(owner);
        ipe = new MockIPE(owner);
        market = new IpeMarket(address(ipe), treasury, owner);
        vm.stopPrank();

        // fund alice + bob with IPE
        vm.prank(owner);
        ipe.mint(alice, 1_000 ether);
        vm.prank(owner);
        ipe.mint(bob, 1_000 ether);
    }

    function _listProduct(uint256 maxSupply) internal returns (uint256 productId) {
        vm.prank(owner);
        productId = market.listProduct(PRICE, maxSupply, ROYALTY_BPS, "ipfs://t-shirt");
    }

    // ─── product CRUD ──────────────────────────────────────────

    function test_listProduct_setsRoyalty() public {
        uint256 pid = _listProduct(0);
        (address receiver, uint256 amount) = market.royaltyInfo(pid, 100 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 5 ether); // 5%
    }

    function test_listProduct_revertsOnZeroPrice() public {
        vm.prank(owner);
        vm.expectRevert(IpeMarket.InvalidPrice.selector);
        market.listProduct(0, 0, ROYALTY_BPS, "ipfs://x");
    }

    function test_listProduct_revertsOnExcessiveRoyalty() public {
        vm.prank(owner);
        vm.expectRevert(IpeMarket.RoyaltyTooHigh.selector);
        market.listProduct(PRICE, 0, 1_001, "ipfs://x");
    }

    function test_updateProduct_changesPriceAndUri() public {
        uint256 pid = _listProduct(0);
        vm.prank(owner);
        market.updateProduct(pid, 100 ether, true, "ipfs://new");
        (uint256 price,, bool active, ) = market.products(pid);
        assertEq(price, 100 ether);
        assertTrue(active);
        assertEq(market.uri(pid), "ipfs://new");
    }

    // ─── primary sale ──────────────────────────────────────────

    function test_buy_transfersIPEToTreasuryAndMints1155() public {
        uint256 pid = _listProduct(0);

        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        market.buy(pid, 1);
        vm.stopPrank();

        assertEq(ipe.balanceOf(treasury), PRICE);
        assertEq(market.balanceOf(alice, pid), 1);
        assertEq(market.totalSupply(pid), 1);
    }

    function test_buy_revertsWhenInactive() public {
        uint256 pid = _listProduct(0);
        vm.prank(owner);
        market.updateProduct(pid, PRICE, false, "ipfs://t-shirt");

        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        vm.expectRevert(IpeMarket.ProductInactive.selector);
        market.buy(pid, 1);
        vm.stopPrank();
    }

    function test_buy_respectsMaxSupply() public {
        uint256 pid = _listProduct(2);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE * 3);
        market.buy(pid, 2);
        vm.expectRevert(IpeMarket.MaxSupplyExceeded.selector);
        market.buy(pid, 1);
        vm.stopPrank();
    }

    function test_buy_revertsOnZeroQuantity() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        vm.expectRevert(IpeMarket.InvalidQuantity.selector);
        market.buy(pid, 0);
        vm.stopPrank();
    }

    // ─── redeem ────────────────────────────────────────────────

    function test_redeem_burnsHolderTokens() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        market.buy(pid, 1);
        market.redeem(alice, pid, 1);
        vm.stopPrank();

        assertEq(market.balanceOf(alice, pid), 0);
    }

    function test_redeem_ownerCanBurnOnDelivery() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        market.buy(pid, 1);
        vm.stopPrank();

        vm.prank(owner);
        market.redeem(alice, pid, 1);
        assertEq(market.balanceOf(alice, pid), 0);
    }

    function test_redeem_revertsForUnrelatedCaller() public {
        uint256 pid = _listProduct(0);
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        market.buy(pid, 1);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(IpeMarket.NotSeller.selector);
        market.redeem(alice, pid, 1);
    }

    // ─── resale ────────────────────────────────────────────────

    function _aliceBuysOne(uint256 pid) internal {
        vm.startPrank(alice);
        ipe.approve(address(market), PRICE);
        market.buy(pid, 1);
        vm.stopPrank();
    }

    function test_listForResale_escrowsTheUnit() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.prank(alice);
        uint256 lid = market.listForResale(pid, 1, 80 ether);

        assertEq(market.balanceOf(alice, pid), 0);
        assertEq(market.balanceOf(address(market), pid), 1);
        (address seller,, uint256 quantity, uint256 price, bool active) = market.listings(lid);
        assertEq(seller, alice);
        assertEq(quantity, 1);
        assertEq(price, 80 ether);
        assertTrue(active);
    }

    function test_buyResale_paysSellerNetOfRoyaltyAndTreasuryGetsRoyalty() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.prank(alice);
        uint256 lid = market.listForResale(pid, 1, 100 ether);

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

    function test_cancelResale_returnsUnits() public {
        uint256 pid = _listProduct(0);
        _aliceBuysOne(pid);

        vm.startPrank(alice);
        uint256 lid = market.listForResale(pid, 1, 80 ether);
        market.cancelResale(lid);
        vm.stopPrank();

        assertEq(market.balanceOf(alice, pid), 1);
        assertEq(market.balanceOf(address(market), pid), 0);
    }

    function test_buyResale_partialFillKeepsListingOpen() public {
        uint256 pid = _listProduct(0);

        vm.startPrank(alice);
        ipe.approve(address(market), PRICE * 3);
        market.buy(pid, 3);
        uint256 lid = market.listForResale(pid, 3, 100 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        ipe.approve(address(market), 200 ether);
        market.buyResale(lid, 2);
        vm.stopPrank();

        (, , uint256 quantity, , bool active) = market.listings(lid);
        assertEq(quantity, 1);
        assertTrue(active);
        assertEq(market.balanceOf(bob, pid), 2);
    }

    // ─── treasury ──────────────────────────────────────────────

    function test_withdraw_movesIPEFromContract() public {
        // Seed the contract with some IPE (e.g. royalties accidentally routed there)
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
