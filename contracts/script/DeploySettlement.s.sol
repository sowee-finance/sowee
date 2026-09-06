// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {MaturitySettlement} from "../src/MaturitySettlement.sol";
import {MockHTS} from "../test/mocks/MockHTS.sol";

/// @notice Second stage of a Hedera deploy: the settlement contract and its wiring. It is split
/// out because its constructor associates itself with the HTS token through the precompile at
/// 0x167, which the local execution can only mock — so this runs with `--skip-simulation` and a
/// larger gas multiplier while the core stage does not need either.
///
/// WRITE_DEPLOYMENTS=true forge script script/DeploySettlement.s.sol --rpc-url hedera_testnet \
///   --broadcast --skip-simulation --gas-estimate-multiplier 200
contract DeploySettlement is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address usdc = vm.envAddress("USDC");
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        InvoiceMarket market =
            InvoiceMarket(vm.parseJsonAddress(vm.readFile(file), ".invoiceMarket"));

        if (block.chainid == 295 || block.chainid == 296) {
            vm.etch(address(0x167), type(MockHTS).runtimeCode);
        }

        vm.startBroadcast(pk);
        MaturitySettlement settlement = new MaturitySettlement(IERC20(usdc), market);
        market.setSettlement(address(settlement));
        vm.stopBroadcast();

        console.log("settlement:", address(settlement));
        if (vm.envOr("WRITE_DEPLOYMENTS", false)) {
            vm.writeJson(vm.toString(address(settlement)), file, ".maturitySettlement");
        }
    }
}
