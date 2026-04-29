// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IpeMarket
/// @notice ERC-1155 marketplace for ipê.city merch. Each tokenId is a product.
///         Primary sales go from buyer → treasury (in IPE) and mint a 1155 receipt.
///         Holders can list receipts for resale; the contract enforces ERC-2981
///         royalties to the treasury on resale.
contract IpeMarket is ERC1155Supply, ERC2981, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Payment token (e.g. $IPE on Base mainnet, MockIPE on Sepolia).
    IERC20 public immutable paymentToken;

    /// @notice Treasury that receives primary-sale revenue and royalties.
    address public treasury;

    struct Product {
        uint256 price;       // in paymentToken's smallest unit
        uint256 maxSupply;   // 0 = unlimited
        bool active;
        string uri;
    }

    /// @dev productId => Product
    mapping(uint256 => Product) public products;
    uint256 public nextProductId = 1;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 quantity;
        uint256 pricePerUnit;  // in paymentToken
        bool active;
    }

    /// @dev listingId => Listing
    mapping(uint256 => Listing) public listings;
    uint256 public nextListingId = 1;

    // ─── events ────────────────────────────────────────────────
    event ProductListed(uint256 indexed productId, uint256 price, uint256 maxSupply, uint96 royaltyBps, string uri);
    event ProductUpdated(uint256 indexed productId, uint256 price, bool active, string uri);
    event Purchased(address indexed buyer, uint256 indexed productId, uint256 quantity, uint256 totalPaid);
    event Redeemed(address indexed holder, uint256 indexed productId, uint256 quantity);
    event ResaleListed(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 quantity, uint256 pricePerUnit);
    event ResaleCancelled(uint256 indexed listingId);
    event ResalePurchased(uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 totalPaid, uint256 royaltyPaid);
    event TreasuryUpdated(address indexed previous, address indexed current);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── errors ────────────────────────────────────────────────
    error InvalidPrice();
    error InvalidTreasury();
    error ProductNotFound();
    error ProductInactive();
    error MaxSupplyExceeded();
    error InvalidQuantity();
    error ListingNotFound();
    error ListingInactive();
    error NotSeller();
    error InsufficientBalance();
    error RoyaltyTooHigh();

    constructor(address paymentToken_, address treasury_, address initialOwner)
        ERC1155("")
        Ownable(initialOwner)
    {
        if (paymentToken_ == address(0)) revert InvalidTreasury();
        if (treasury_ == address(0)) revert InvalidTreasury();
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
    }

    // ─── admin: products ────────────────────────────────────────

    /// @notice Create a new product. `royaltyBps` is in basis points (500 = 5%).
    function listProduct(uint256 price, uint256 maxSupply, uint96 royaltyBps, string calldata uri_)
        external
        onlyOwner
        returns (uint256 productId)
    {
        if (price == 0) revert InvalidPrice();
        if (royaltyBps > 1_000) revert RoyaltyTooHigh(); // cap at 10%

        productId = nextProductId++;
        products[productId] = Product({price: price, maxSupply: maxSupply, active: true, uri: uri_});
        _setTokenRoyalty(productId, treasury, royaltyBps);

        emit ProductListed(productId, price, maxSupply, royaltyBps, uri_);
    }

    /// @notice Update price / active flag / metadata URI for an existing product.
    function updateProduct(uint256 productId, uint256 price, bool active, string calldata uri_)
        external
        onlyOwner
    {
        Product storage p = products[productId];
        if (p.price == 0) revert ProductNotFound();
        if (price == 0) revert InvalidPrice();
        p.price = price;
        p.active = active;
        p.uri = uri_;
        emit ProductUpdated(productId, price, active, uri_);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // ─── primary sale ───────────────────────────────────────────

    function buy(uint256 productId, uint256 qty) external nonReentrant {
        if (qty == 0) revert InvalidQuantity();
        Product memory p = products[productId];
        if (p.price == 0) revert ProductNotFound();
        if (!p.active) revert ProductInactive();
        if (p.maxSupply != 0 && totalSupply(productId) + qty > p.maxSupply) revert MaxSupplyExceeded();

        uint256 totalPaid = p.price * qty;
        paymentToken.safeTransferFrom(msg.sender, treasury, totalPaid);
        _mint(msg.sender, productId, qty, "");

        emit Purchased(msg.sender, productId, qty, totalPaid);
    }

    // ─── redemption ─────────────────────────────────────────────

    /// @notice Burn 1155 receipts when the buyer redeems the physical item.
    ///         Either the holder or the contract owner (admin acting on confirmed delivery)
    ///         can call this, mirroring the off-chain shipping workflow.
    function redeem(address holder, uint256 productId, uint256 qty) external {
        if (msg.sender != holder && msg.sender != owner()) revert NotSeller();
        if (qty == 0) revert InvalidQuantity();
        if (balanceOf(holder, productId) < qty) revert InsufficientBalance();
        _burn(holder, productId, qty);
        emit Redeemed(holder, productId, qty);
    }

    // ─── resale ─────────────────────────────────────────────────

    function listForResale(uint256 tokenId, uint256 qty, uint256 pricePerUnit)
        external
        nonReentrant
        returns (uint256 listingId)
    {
        if (qty == 0) revert InvalidQuantity();
        if (pricePerUnit == 0) revert InvalidPrice();
        if (balanceOf(msg.sender, tokenId) < qty) revert InsufficientBalance();

        // escrow the units in the contract
        _safeTransferFrom(msg.sender, address(this), tokenId, qty, "");

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            quantity: qty,
            pricePerUnit: pricePerUnit,
            active: true
        });

        emit ResaleListed(listingId, msg.sender, tokenId, qty, pricePerUnit);
    }

    function cancelResale(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingInactive();
        if (l.seller != msg.sender) revert NotSeller();

        l.active = false;
        _safeTransferFrom(address(this), l.seller, l.tokenId, l.quantity, "");
        emit ResaleCancelled(listingId);
    }

    function buyResale(uint256 listingId, uint256 qty) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingInactive();
        if (qty == 0 || qty > l.quantity) revert InvalidQuantity();

        uint256 totalPaid = l.pricePerUnit * qty;
        (address royaltyReceiver, uint256 royalty) = royaltyInfo(l.tokenId, totalPaid);

        // pull payment
        paymentToken.safeTransferFrom(msg.sender, l.seller, totalPaid - royalty);
        if (royalty > 0) {
            paymentToken.safeTransferFrom(msg.sender, royaltyReceiver, royalty);
        }

        // release units
        l.quantity -= qty;
        if (l.quantity == 0) l.active = false;
        _safeTransferFrom(address(this), msg.sender, l.tokenId, qty, "");

        emit ResalePurchased(listingId, msg.sender, qty, totalPaid, royalty);
    }

    // ─── views ──────────────────────────────────────────────────

    function uri(uint256 productId) public view override returns (string memory) {
        return products[productId].uri;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return ERC1155.supportsInterface(interfaceId) || ERC2981.supportsInterface(interfaceId);
    }

    // ─── ERC-1155 receiver (so the contract can escrow resale units) ───

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
