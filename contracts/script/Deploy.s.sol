// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockIPE} from "../src/MockIPE.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IpeMarket} from "../src/IpeMarket.sol";

/// @notice Deploys mocks (when no real addresses provided) plus IpeMarket and
///         whitelists the payment tokens.
///         Env: DEPLOYER_PRIVATE_KEY, IPE_TOKEN_ADDRESS (opt), USDC_TOKEN_ADDRESS (opt),
///              TREASURY_ADDRESS (opt — defaults to deployer).
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address ipeAddr = vm.envOr("IPE_TOKEN_ADDRESS", address(0));
        address usdcAddr = vm.envOr("USDC_TOKEN_ADDRESS", address(0));
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);

        if (ipeAddr == address(0)) {
            MockIPE ipe = new MockIPE(deployer);
            ipeAddr = address(ipe);
            console.log("MockIPE deployed:", ipeAddr);
        } else {
            console.log("Using existing IPE token:", ipeAddr);
        }

        if (usdcAddr == address(0)) {
            MockUSDC usdc = new MockUSDC(deployer);
            usdcAddr = address(usdc);
            console.log("MockUSDC deployed:", usdcAddr);
        } else {
            console.log("Using existing USDC token:", usdcAddr);
        }

        IpeMarket market = new IpeMarket(treasury, deployer);
        console.log("IpeMarket deployed:", address(market));
        console.log("Treasury:", treasury);

        market.setAcceptedToken(ipeAddr, true);
        market.setAcceptedToken(usdcAddr, true);
        console.log("Accepted tokens whitelisted");

        vm.stopBroadcast();
    }
}
