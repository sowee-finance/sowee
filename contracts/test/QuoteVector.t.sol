// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";

/// @dev Pins the EIP-712 digest for a fixed quote on chain 296 at a fixed oracle address, so the
/// off-chain signer (Go API) can be checked byte-for-byte against the contract.
contract QuoteVectorTest is Test {
    address constant ORACLE = 0x1111111111111111111111111111111111111111;

    function test_vector() public {
        vm.chainId(296);
        deployCodeTo(
            "DiscountOracle.sol:DiscountOracle",
            abi.encode(address(0xBEEF), address(0xCAFE)),
            ORACLE
        );
        DiscountOracle oracle = DiscountOracle(ORACLE);
        DiscountOracle.Quote memory q = DiscountOracle.Quote({
            invoiceId: keccak256("INV-1"),
            issuer: 0x2222222222222222222222222222222222222222,
            faceValue: 10_000e6,
            maturity: 1_802_592_000,
            discountRateBps: 300,
            validUntil: 1_800_000_000,
            nonce: 42
        });
        bytes32 digest = oracle.hashQuote(q);
        console.logBytes32(digest);
        console.logBytes32(q.invoiceId);
        assertEq(digest, VECTOR);
    }

    bytes32 constant VECTOR = 0x5b0882ed8db5191c229239578fad37ba5792de7c0f5aed352a241a541b0536a3;
}
