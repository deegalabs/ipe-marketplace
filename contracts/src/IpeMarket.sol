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
/// @notice ERC-1155 marketplace for ipê.city merch with multi-token pricing.
///         Each tokenId is a product. Admin whitelists payment tokens (e.g. $IPE,
///         USDC) and sets a fixed price *per token* per product — there's no
///         oracle, so prices are predictable and admin controls margin per market.
///         Fiat-paid orders (PIX in v0.3) come in through `mintTo`, called by the
///         owner after the off-chain payment confirms.
contract IpeMarket is ERC1155Supply, ERC2981, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Treasury that receives primary-sale revenue and royalties.
    address public treasury;

    /// @notice Whitelisted payment tokens. buy(...) reverts unless the token is here.
    mapping(address token => bool) public acceptedTokens;

    struct Product {
        uint256 maxSupply;   // 0 = unlimited
        bool active;
        string uri;
    }

    /// @dev productId => Product
    mapping(uint256 productId => Product) public products;

    /// @dev productId => token => price (in token's smallest unit). 0 means
    ///      this product is not sold in this token, even if the token is accepted.
    mapping(uint256 productId => mapping(address token => uint256 price)) public prices;

    uint256 public nextProductId = 1;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 quantity;
        address paymentToken;
        uint256 pricePerUnit;  // in paymentToken's smallest unit
        bool active;
    }

    /// @dev listingId => Listing
    mapping(uint256 listingId => Listing) public listings;
    uint256 public nextListingId = 1;

    // ─── events ────────────────────────────────────────────────
    event TokenAccepted(address indexed token, bool accepted);
    event ProductListed(uint256 indexed productId, uint256 maxSupply, uint96 royaltyBps, string uri);
    event ProductUpdated(uint256 indexed productId, bool active, string uri);
    event PriceSet(uint256 indexed productId, address indexed token, uint256 price);
    event Purchased(
        address indexed buyer,
        uint256 indexed productId,
        uint256 quantity,
        address paymentToken,
        uint256 totalPaid
    );
    /// @notice Emitted on fiat-confirmed mint (PIX, etc). `fiatRef` is an opaque
    ///         identifier from the payment provider so off-chain systems can
    ///         reconcile (e.g. Asaas paymentId encoded as bytes32).
    event FiatMinted(
        address indexed buyer,
        uint256 indexed productId,
        uint256 quantity,
        bytes32 fiatRef
    );
    event Redeemed(address indexed holder, uint256 indexed productId, uint256 quantity);
    event ResaleListed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 quantity,
        address paymentToken,
        uint256 pricePerUnit
    );
    event ResaleCancelled(uint256 indexed listingId);
    event ResalePurchased(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 quantity,
        uint256 totalPaid,
        uint256 royaltyPaid
    );
    event TreasuryUpdated(address indexed previous, address indexed current);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── errors ────────────────────────────────────────────────
    error InvalidPrice();
    error InvalidTreasury();
    error InvalidToken();
    error TokenNotAccepted();
    error ProductNotFound();
    error ProductInactive();
    error MaxSupplyExceeded();
    error InvalidQuantity();
    error PriceNotSetForToken();
    error ListingNotFound();
    error ListingInactive();
    error NotSeller();
    error InsufficientBalance();
    error RoyaltyTooHigh();
    error LengthMismatch();

    constructor(address treasury_, address initialOwner)
        ERC1155("")
        Ownable(initialOwner)
    {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
    }

    // ─── admin: tokens ─────────────────────────────────────────

    function setAcceptedToken(address token, bool accepted) external onlyOwner {
        if (token == address(0)) revert InvalidToken();
        acceptedTokens[token] = accepted;
        emit TokenAccepted(token, accepted);
    }

    // ─── admin: products ────────────────────────────────────────

    /// @notice Create a product with prices in one or more accepted tokens.
    /// @param tokens   payment tokens this product accepts (must be whitelisted)
    /// @param tokenPrices  parallel array of prices in each token's smallest unit
    function listProduct(
        uint256 maxSupply,
        uint96 royaltyBps,
        string calldata uri_,
        address[] calldata tokens,
        uint256[] calldata tokenPrices
    ) external onlyOwner returns (uint256 productId) {
        if (royaltyBps > 1_000) revert RoyaltyTooHigh(); // cap at 10%
        if (tokens.length == 0) revert PriceNotSetForToken();
        if (tokens.length != tokenPrices.length) revert LengthMismatch();

        productId = nextProductId++;
        products[productId] = Product({maxSupply: maxSupply, active: true, uri: uri_});
        _setTokenRoyalty(productId, treasury, royaltyBps);
        emit ProductListed(productId, maxSupply, royaltyBps, uri_);

        for (uint256 i = 0; i < tokens.length; ++i) {
            _setPrice(productId, tokens[i], tokenPrices[i]);
        }
    }

    function updateProduct(uint256 productId, bool active, string calldata uri_) external onlyOwner {
        if (productId == 0 || productId >= nextProductId) revert ProductNotFound();
        Product storage p = products[productId];
        p.active = active;
        p.uri = uri_;
        emit ProductUpdated(productId, active, uri_);
    }

    /// @notice Set or update the price of a product in a given payment token.
    ///         Pass `price = 0` to disable that token for this product.
    function setPrice(uint256 productId, address token, uint256 price) external onlyOwner {
        if (productId == 0 || productId >= nextProductId) revert ProductNotFound();
        _setPrice(productId, token, price);
    }

    function _setPrice(uint256 productId, address token, uint256 price) internal {
        if (!acceptedTokens[token]) revert TokenNotAccepted();
        prices[productId][token] = price;
        emit PriceSet(productId, token, price);
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

    // ─── primary sale (crypto) ──────────────────────────────────

    function buy(uint256 productId, uint256 qty, address paymentToken) external nonReentrant {
        if (qty == 0) revert InvalidQuantity();
        if (!acceptedTokens[paymentToken]) revert TokenNotAccepted();

        Product memory p = products[productId];
        if (!p.active) revert ProductInactive();

        uint256 unitPrice = prices[productId][paymentToken];
        if (unitPrice == 0) revert PriceNotSetForToken();
        if (p.maxSupply != 0 && totalSupply(productId) + qty > p.maxSupply) revert MaxSupplyExceeded();

        uint256 totalPaid = unitPrice * qty;
        IERC20(paymentToken).safeTransferFrom(msg.sender, treasury, totalPaid);
        _mint(msg.sender, productId, qty, "");

        emit Purchased(msg.sender, productId, qty, paymentToken, totalPaid);
    }

    // ─── primary sale (fiat, off-chain confirmed) ───────────────

    /// @notice Mint a 1155 receipt for a buyer that paid via off-chain rails (PIX,
    ///         credit card, etc). Owner-only because the contract has no way to
    ///         verify the off-chain payment — trust is delegated to the operator
    ///         that watches the PSP webhook.
    function mintTo(
        address buyer,
        uint256 productId,
        uint256 qty,
        bytes32 fiatRef
    ) external onlyOwner nonReentrant {
        if (qty == 0) revert InvalidQuantity();
        if (buyer == address(0)) revert InvalidToken();
        Product memory p = products[productId];
        if (!p.active) revert ProductInactive();
        if (p.maxSupply != 0 && totalSupply(productId) + qty > p.maxSupply) revert MaxSupplyExceeded();

        _mint(buyer, productId, qty, "");
        emit FiatMinted(buyer, productId, qty, fiatRef);
    }

    // ─── redemption ─────────────────────────────────────────────

    function redeem(address holder, uint256 productId, uint256 qty) external {
        if (msg.sender != holder && msg.sender != owner()) revert NotSeller();
        if (qty == 0) revert InvalidQuantity();
        if (balanceOf(holder, productId) < qty) revert InsufficientBalance();
        _burn(holder, productId, qty);
        emit Redeemed(holder, productId, qty);
    }

    // ─── resale ─────────────────────────────────────────────────

    function listForResale(uint256 tokenId, uint256 qty, address paymentToken, uint256 pricePerUnit)
        external
        nonReentrant
        returns (uint256 listingId)
    {
        if (qty == 0) revert InvalidQuantity();
        if (pricePerUnit == 0) revert InvalidPrice();
        if (!acceptedTokens[paymentToken]) revert TokenNotAccepted();
        if (balanceOf(msg.sender, tokenId) < qty) revert InsufficientBalance();

        _safeTransferFrom(msg.sender, address(this), tokenId, qty, "");

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            quantity: qty,
            paymentToken: paymentToken,
            pricePerUnit: pricePerUnit,
            active: true
        });

        emit ResaleListed(listingId, msg.sender, tokenId, qty, paymentToken, pricePerUnit);
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

        IERC20(l.paymentToken).safeTransferFrom(msg.sender, l.seller, totalPaid - royalty);
        if (royalty > 0) {
            IERC20(l.paymentToken).safeTransferFrom(msg.sender, royaltyReceiver, royalty);
        }

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
