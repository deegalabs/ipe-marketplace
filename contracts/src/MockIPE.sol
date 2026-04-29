// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Test ERC-20 used to stand in for $IPE on Base Sepolia.
///         Anyone can call `faucet` to get tokens for testing the marketplace.
contract MockIPE is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000 ether;

    constructor(address initialOwner) ERC20("Mock IPE", "mIPE") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 ether);
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
