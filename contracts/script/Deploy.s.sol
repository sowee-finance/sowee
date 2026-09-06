// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {MaturitySettlement} from "../src/MaturitySettlement.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {MockHTS} from "../test/mocks/MockHTS.sol";

/// @notice Deploys the Sowee core to the target network and wires the pieces together.
/// The deployer becomes owner, compliance operator and treasury; rotate those afterwards.
///
/// Local:    anvil & forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
/// Dry run:  forge script script/Deploy.s.sol --rpc-url hedera_testnet
/// Deploy:   WRITE_DEPLOYMENTS=true forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address signer = vm.envAddress("QUOTE_SIGNER");
        address usdc = block.chainid == 31_337 ? address(0) : vm.envAddress("USDC");

        // The simulation cannot reach the HTS precompile; stand in a mock so the association call
        // in MaturitySettlement's constructor succeeds locally. Broadcast hits the real 0x167.
        if (block.chainid == 295 || block.chainid == 296) {
            vm.etch(address(0x167), type(MockHTS).runtimeCode);
        }

        vm.startBroadcast(pk);
        if (usdc == address(0)) usdc = address(new MockUSDC());
        DiscountOracle oracle = new DiscountOracle(signer, deployer);
        InvoiceMarket market = new InvoiceMarket(IERC20(usdc), oracle, deployer, deployer, deployer);
        MaturitySettlement settlement = new MaturitySettlement(IERC20(usdc), market);
        oracle.setConsumer(address(market));
        market.setSettlement(address(settlement));
        market.setFee(50, deployer); // 0.5% platform fee, buyer -> treasury
        vm.stopBroadcast();

        console.log("chain id  :", block.chainid);
        console.log("deployer  :", deployer);
        console.log("usdc      :", usdc);
        console.log("signer    :", signer);
        console.log("oracle    :", address(oracle));
        console.log("market    :", address(market));
        console.log("settlement:", address(settlement));

        if (vm.envOr("WRITE_DEPLOYMENTS", false)) {
            string memory j = "deployment";
            vm.serializeUint(j, "chainId", block.chainid);
            vm.serializeAddress(j, "usdc", usdc);
            vm.serializeAddress(j, "quoteSigner", signer);
            vm.serializeAddress(j, "discountOracle", address(oracle));
            vm.serializeAddress(j, "invoiceMarket", address(market));
            string memory out = vm.serializeAddress(j, "maturitySettlement", address(settlement));
            vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
        }
    }
}
