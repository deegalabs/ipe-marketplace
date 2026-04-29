// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockIPE} from "../src/MockIPE.sol";
import {IpeMarket} from "../src/IpeMarket.sol";

/// @notice Deploys MockIPE (if no token address provided) and IpeMarket to the active RPC.
///         Reads from env: DEPLOYER_PRIVATE_KEY, IPE_TOKEN_ADDRESS (optional), TREASURY_ADDRESS (optional).
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address tokenAddr = vm.envOr("IPE_TOKEN_ADDRESS", address(0));
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);

        if (tokenAddr == address(0)) {
            MockIPE token = new MockIPE(deployer);
            tokenAddr = address(token);
            console.log("MockIPE deployed:", tokenAddr);
        } else {
            console.log("Using existing IPE token:", tokenAddr);
        }

        IpeMarket market = new IpeMarket(tokenAddr, treasury, deployer);
        console.log("IpeMarket deployed:", address(market));
        console.log("Treasury:", treasury);

        vm.stopBroadcast();
    }
}
