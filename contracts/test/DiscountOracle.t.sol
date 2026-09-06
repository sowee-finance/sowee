// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";

contract DiscountOracleTest is Test {
    DiscountOracle oracle;

    uint256 signerPk = 0xA11CE;
    address signer = vm.addr(signerPk);
    address owner = makeAddr("owner");
    address consumer = makeAddr("consumer");

    function setUp() public {
        oracle = new DiscountOracle(signer, owner);
        vm.prank(owner);
        oracle.setConsumer(consumer);
    }

    function quote(uint64 nonce) internal view returns (DiscountOracle.Quote memory q) {
        q = DiscountOracle.Quote({
            invoiceId: keccak256("INV-1"),
            issuer: address(0xBEEF),
            faceValue: 10_000e6,
            maturity: uint64(block.timestamp + 30 days),
            discountRateBps: 300,
            validUntil: uint64(block.timestamp + 15 minutes),
            nonce: nonce
        });
    }

    function sign(uint256 pk, DiscountOracle.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, oracle.hashQuote(q));
        return abi.encodePacked(r, s, v);
    }

    function test_consumeValidQuote() public {
        DiscountOracle.Quote memory q = quote(1);
        bytes memory sig = sign(signerPk, q);
        oracle.verify(q, sig);

        vm.expectEmit(true, false, false, true);
        emit DiscountOracle.QuoteConsumed(q.invoiceId, 300, 1);
        vm.prank(consumer);
        oracle.consume(q, sig);
        assertTrue(oracle.nonceUsed(1));
    }

    function test_replayReverts() public {
        DiscountOracle.Quote memory q = quote(7);
        bytes memory sig = sign(signerPk, q);
        vm.startPrank(consumer);
        oracle.consume(q, sig);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.NonceUsed.selector, 7));
        oracle.consume(q, sig);
        vm.stopPrank();
    }

    function test_expiredReverts() public {
        DiscountOracle.Quote memory q = quote(2);
        bytes memory sig = sign(signerPk, q);
        vm.warp(q.validUntil + 1);
        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.QuoteExpired.selector, q.validUntil));
        oracle.consume(q, sig);
    }

    function test_wrongSignerReverts() public {
        DiscountOracle.Quote memory q = quote(3);
        bytes memory sig = sign(0xB0B, q);
        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.BadSigner.selector, vm.addr(0xB0B)));
        oracle.consume(q, sig);
    }

    function test_tamperedQuoteReverts() public {
        DiscountOracle.Quote memory q = quote(4);
        bytes memory sig = sign(signerPk, q);
        q.discountRateBps = 100; // buyer-favourable tamper
        vm.prank(consumer);
        vm.expectRevert(); // recovers to some other address -> BadSigner
        oracle.consume(q, sig);
    }

    function test_onlyConsumerCanConsume() public {
        DiscountOracle.Quote memory q = quote(5);
        bytes memory sig = sign(signerPk, q);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.NotConsumer.selector, owner));
        oracle.consume(q, sig);
    }

    function test_rateTooHighReverts() public {
        DiscountOracle.Quote memory q = quote(6);
        q.discountRateBps = 5001;
        bytes memory sig = sign(signerPk, q);
        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.RateTooHigh.selector, 5001));
        oracle.consume(q, sig);
    }
}
