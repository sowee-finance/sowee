// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";

/// @notice Deploys the Sowee core to the target network and wires the pieces together.
/// The deployer becomes owner, compliance operator and treasury; rotate those afterwards.
///
/// Dry run:  forge script script/Deploy.s.sol --rpc-url hedera_testnet
/// Deploy:   WRITE_DEPLOYMENTS=true forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address usdc = vm.envAddress("USDC");
        address signer = vm.envAddress("QUOTE_SIGNER");
        console.log("chain id  :", block.chainid);
        console.log("deployer  :", deployer);
        console.log("usdc      :", usdc);
        console.log("signer    :", signer);

        vm.startBroadcast(pk);
        DiscountOracle oracle = new DiscountOracle(signer, deployer);
        InvoiceMarket market = new InvoiceMarket(IERC20(usdc), oracle, deployer, deployer, deployer);
        oracle.setConsumer(address(market));
        market.setFee(50, deployer); // 0.5% platform fee, buyer -> treasury
        vm.stopBroadcast();

        console.log("oracle    :", address(oracle));
        console.log("market    :", address(market));

        if (vm.envOr("WRITE_DEPLOYMENTS", false)) {
            string memory j = "deployment";
            vm.serializeUint(j, "chainId", block.chainid);
            vm.serializeAddress(j, "usdc", usdc);
            vm.serializeAddress(j, "quoteSigner", signer);
            vm.serializeAddress(j, "discountOracle", address(oracle));
            string memory out = vm.serializeAddress(j, "invoiceMarket", address(market));
            vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
        }
    }
}
