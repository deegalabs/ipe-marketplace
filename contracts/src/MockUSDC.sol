// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Test USDC used for local dev / Sepolia. Real USDC on Base mainnet
///         lives at 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 and uses 6 decimals,
///         which we mirror here.
contract MockUSDC is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e6; // 1000 USDC

    constructor(address initialOwner) ERC20("Mock USD Coin", "mUSDC") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 1e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
