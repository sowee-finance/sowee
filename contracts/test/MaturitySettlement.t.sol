// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondToken} from "../src/BondToken.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {MaturitySettlement} from "../src/MaturitySettlement.sol";
import {HederaAssociable} from "../src/HederaAssociable.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockHTS} from "./mocks/MockHTS.sol";

contract MaturitySettlementTest is Test {
    MockUSDC usdc;
    DiscountOracle oracle;
    InvoiceMarket market;
    MaturitySettlement settlement;
    BondToken bond;

    uint256 signerPk = 0xA11CE;
    address owner = makeAddr("owner");
    address compliance = makeAddr("compliance");
    address issuer = makeAddr("issuer");
    address payor = makeAddr("payor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant INV = keccak256("INV-1");
    uint256 constant FACE = 10_000e6;
    uint64 maturity;

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new DiscountOracle(vm.addr(signerPk), owner);
        market = new InvoiceMarket(usdc, oracle, compliance, owner, owner);
        settlement = new MaturitySettlement(usdc, market);
        vm.startPrank(owner);
        oracle.setConsumer(address(market));
        market.setSettlement(address(settlement));
        vm.stopPrank();

        maturity = uint64(block.timestamp + 30 days);
        DiscountOracle.Quote memory q = DiscountOracle.Quote({
            invoiceId: INV,
            faceValue: FACE,
            discountRateBps: 300,
            validUntil: uint64(block.timestamp + 15 minutes),
            nonce: 1
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, oracle.hashQuote(q));
        vm.prank(issuer);
        bond =
            market.listInvoice("Sowee Bond INV-1", "sINV1", maturity, q, abi.encodePacked(r, s, v));

        address[3] memory who = [alice, bob, payor];
        for (uint256 i; i < who.length; i++) {
            usdc.mint(who[i], 100_000e6);
            vm.prank(who[i]);
            usdc.approve(address(market), type(uint256).max);
            vm.prank(who[i]);
            usdc.approve(address(settlement), type(uint256).max);
        }
        vm.startPrank(compliance);
        bond.setEligible(alice, true);
        bond.setEligible(bob, true);
        vm.stopPrank();
        vm.prank(alice);
        market.buyPrimary(INV, 6000e6);
        vm.prank(bob);
        market.buyPrimary(INV, 4000e6);
    }

    function test_settlementHasIssuerRoleFromListing() public view {
        assertTrue(bond.hasRole(bond.ISSUER_ROLE(), address(settlement)));
    }

    function test_settleBeforeMaturityReverts() public {
        vm.prank(payor);
        settlement.registerRepayment(INV, FACE);
        vm.expectRevert(abi.encodeWithSelector(MaturitySettlement.NotMatured.selector, maturity));
        settlement.settle(INV);
    }

    function test_settleWithoutRepaymentReverts() public {
        vm.warp(maturity);
        vm.expectRevert(abi.encodeWithSelector(MaturitySettlement.NothingRepaid.selector, INV));
        settlement.settle(INV);
    }

    function test_fullRepayment_proRataClaims_burnUnits() public {
        vm.prank(payor);
        settlement.registerRepayment(INV, FACE);
        vm.warp(maturity);
        settlement.settle(INV); // anyone

        assertEq(settlement.claimable(INV, alice), 6000e6);
        vm.prank(alice);
        settlement.claim(INV);
        assertEq(usdc.balanceOf(alice), 100_000e6 - 5820e6 + 6000e6); // paid 97% of 6k, got 6k
        assertEq(bond.balanceOf(alice), 0);

        vm.prank(bob);
        settlement.claim(INV);
        assertEq(bond.totalSupply(), 0);
        assertEq(usdc.balanceOf(address(settlement)), 0);
    }

    function test_partialRepayment_sharesLoss() public {
        vm.prank(payor);
        settlement.registerRepayment(INV, 5000e6); // 50% recovery
        vm.warp(maturity);
        settlement.settle(INV);
        assertEq(settlement.claimable(INV, alice), 3000e6);
        assertEq(settlement.claimable(INV, bob), 2000e6);
    }

    function test_doubleClaimImpossible() public {
        vm.prank(payor);
        settlement.registerRepayment(INV, FACE);
        vm.warp(maturity);
        settlement.settle(INV);
        vm.startPrank(alice);
        settlement.claim(INV);
        vm.expectRevert(abi.encodeWithSelector(MaturitySettlement.NothingToClaim.selector, alice));
        settlement.claim(INV);
        vm.stopPrank();
    }

    function test_claimBeforeSettleReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MaturitySettlement.NotSettled.selector, INV));
        settlement.claim(INV);
    }

    function test_repaymentAfterSettleReverts() public {
        vm.prank(payor);
        settlement.registerRepayment(INV, FACE);
        vm.warp(maturity);
        settlement.settle(INV);
        vm.prank(payor);
        vm.expectRevert(abi.encodeWithSelector(MaturitySettlement.AlreadySettled.selector, INV));
        settlement.registerRepayment(INV, 1);
    }

    function test_secondaryBuyerAfterSettleClaimsTheirShare() public {
        // alice sells 1k to bob before maturity; after settle bob claims 5k, alice 5k
        vm.startPrank(alice);
        bond.approve(address(market), type(uint256).max);
        uint256 askId = market.makeAsk(INV, 1000e6, 9900);
        vm.stopPrank();
        vm.prank(bob);
        market.fillAsk(askId, 1000e6);

        vm.prank(payor);
        settlement.registerRepayment(INV, FACE);
        vm.warp(maturity);
        settlement.settle(INV);
        assertEq(settlement.claimable(INV, alice), 5000e6);
        assertEq(settlement.claimable(INV, bob), 5000e6);
    }

    // ---- Hedera association ---------------------------------------------------------------

    function test_associatesUsdcOnHedera() public {
        MockHTS hts = new MockHTS();
        vm.etch(address(0x167), address(hts).code);
        vm.chainId(296);
        MaturitySettlement s = new MaturitySettlement(usdc, market);
        assertTrue(MockHTS(address(0x167)).associated(address(s), address(usdc)));
    }

    function test_associationFailureReverts() public {
        MockHTS hts = new MockHTS();
        vm.etch(address(0x167), address(hts).code);
        MockHTS(address(0x167)).setNextResponse(184); // TOKEN_NOT_ASSOCIATED_TO_ACCOUNT-ish failure
        vm.chainId(296);
        vm.expectRevert(
            abi.encodeWithSelector(HederaAssociable.AssociationFailed.selector, int64(184))
        );
        new MaturitySettlement(usdc, market);
    }
}
