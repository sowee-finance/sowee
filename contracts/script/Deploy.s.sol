// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

/// @notice Deploys the Sowee core to the target network.
/// Contracts are added here as they land (BondToken, DiscountOracle, InvoiceMarket, MaturitySettlement).
///
/// Dry run:  forge script script/Deploy.s.sol --rpc-url hedera_testnet
/// Deploy:   forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        console.log("chain id  :", block.chainid);
        console.log("deployer  :", deployer);
        console.log("usdc      :", vm.envAddress("USDC"));
        console.log("signer    :", vm.envAddress("QUOTE_SIGNER"));

        vm.startBroadcast(pk);
        // deployments go here
        vm.stopBroadcast();
    }
}
