// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondToken} from "../src/BondToken.sol";
import {DiscountOracle} from "../src/DiscountOracle.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract InvoiceMarketTest is Test {
    MockUSDC usdc;
    DiscountOracle oracle;
    InvoiceMarket market;

    uint256 signerPk = 0xA11CE;
    address signer = vm.addr(signerPk);
    address owner = makeAddr("owner");
    address compliance = makeAddr("compliance");
    address treasury = makeAddr("treasury");
    address issuer = makeAddr("issuer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol"); // never KYC'd

    bytes32 constant INV = keccak256("INV-1");
    uint256 constant FACE = 10_000e6;
    uint16 constant RATE = 300; // 3%

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new DiscountOracle(signer, owner);
        market = new InvoiceMarket(usdc, oracle, compliance, treasury, owner);
        vm.startPrank(owner);
        oracle.setConsumer(address(market));
        market.setFee(50, treasury); // 0.5%
        vm.stopPrank();

        for (uint256 i; i < 3; i++) {
            address a = [alice, bob, carol][i];
            usdc.mint(a, 100_000e6);
            vm.prank(a);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    function signedQuote(bytes32 invoiceId, uint64 nonce)
        internal
        view
        returns (DiscountOracle.Quote memory q, bytes memory sig)
    {
        return signedQuoteFor(invoiceId, nonce, issuer, uint64(block.timestamp + 30 days));
    }

    function signedQuoteFor(bytes32 invoiceId, uint64 nonce, address issuer_, uint64 maturity)
        internal
        view
        returns (DiscountOracle.Quote memory q, bytes memory sig)
    {
        q = DiscountOracle.Quote({
            invoiceId: invoiceId,
            issuer: issuer_,
            faceValue: FACE,
            maturity: maturity,
            discountRateBps: RATE,
            validUntil: uint64(block.timestamp + 15 minutes),
            nonce: nonce
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, oracle.hashQuote(q));
        sig = abi.encodePacked(r, s, v);
    }

    function list() internal returns (BondToken bond) {
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuote(INV, 1);
        vm.prank(issuer);
        bond = market.listInvoice("Sowee Bond INV-1", "sINV1", q, sig);
    }

    function grant(address who) internal {
        BondToken bond = market.bondOf(INV);
        vm.prank(compliance);
        bond.setEligible(who, true);
    }

    // ---- listing ----------------------------------------------------------------------------

    function test_listInvoice_deploysBondWithRoles() public {
        BondToken bond = list();
        InvoiceMarket.Listing memory l = market.listing(INV);
        assertEq(address(l.bond), address(bond));
        assertEq(l.issuer, issuer);
        assertEq(l.faceValue, FACE);
        assertEq(l.discountRateBps, RATE);
        assertEq(market.listingCount(), 1);
        assertTrue(bond.hasRole(bond.COMPLIANCE_ROLE(), compliance));
        assertTrue(bond.hasRole(bond.ISSUER_ROLE(), address(market)));
        assertTrue(oracle.nonceUsed(1));
    }

    function test_listInvoice_replayedQuoteReverts() public {
        list();
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuote(keccak256("INV-2"), 1);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.NonceUsed.selector, 1));
        market.listInvoice("x", "x", q, sig);
    }

    function test_listInvoice_expiredQuoteReverts() public {
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuote(INV, 9);
        vm.warp(q.validUntil + 1);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(DiscountOracle.QuoteExpired.selector, q.validUntil));
        market.listInvoice("x", "x", q, sig);
    }

    function test_listInvoice_duplicateInvoiceReverts() public {
        list();
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuote(INV, 2);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.AlreadyListed.selector, INV));
        market.listInvoice("x", "x", q, sig);
    }

    function test_listInvoice_onlyQuotedIssuer() public {
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuote(INV, 1);
        vm.prank(alice); // holds a quote made out to `issuer`
        vm.expectRevert(
            abi.encodeWithSelector(InvoiceMarket.NotQuotedIssuer.selector, issuer, alice)
        );
        market.listInvoice("x", "x", q, sig);
    }

    function test_listInvoice_maturityComesFromTheQuote() public {
        uint64 quoted = uint64(block.timestamp + 45 days);
        (DiscountOracle.Quote memory q, bytes memory sig) = signedQuoteFor(INV, 1, issuer, quoted);
        vm.prank(issuer);
        BondToken bond = market.listInvoice("x", "x", q, sig);
        assertEq(bond.maturity(), quoted);
        assertEq(market.listing(INV).maturity, quoted);
    }

    function test_listInvoice_tamperedMaturityReverts() public {
        (DiscountOracle.Quote memory q, bytes memory sig) =
            signedQuoteFor(INV, 1, issuer, uint64(block.timestamp + 1 days));
        q.maturity = uint64(block.timestamp + 5 * 365 days); // 1-day price on a 5-year note
        vm.prank(issuer);
        vm.expectRevert(); // BadSigner: the signature no longer matches
        market.listInvoice("x", "x", q, sig);
    }

    // ---- primary ----------------------------------------------------------------------------

    function test_buyPrimary_paysIssuerAtDiscountAndMints() public {
        BondToken bond = list();
        grant(alice);

        uint256 units = 1000e6;
        uint256 cost = 970e6; // 3% discount
        uint256 fee = 4.85e6; // 0.5% of cost
        assertEq(market.primaryCost(INV, units), cost);

        vm.prank(alice);
        market.buyPrimary(INV, units);

        assertEq(usdc.balanceOf(issuer), cost);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(alice), 100_000e6 - cost - fee);
        assertEq(bond.balanceOf(alice), units);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_buyPrimary_notEligibleReverts() public {
        list();
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BondToken.NotEligible.selector, carol));
        market.buyPrimary(INV, 1e6);
    }

    function test_buyPrimary_afterMaturityReverts() public {
        list();
        grant(alice);
        vm.warp(block.timestamp + 31 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.FundingClosed.selector, INV));
        market.buyPrimary(INV, 1e6);
    }

    function test_buyPrimary_overFaceValueReverts() public {
        list();
        grant(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BondToken.ExceedsFaceValue.selector, FACE + 1, FACE));
        market.buyPrimary(INV, FACE + 1);
    }

    // ---- secondary --------------------------------------------------------------------------

    function _fund(address who, uint256 units) internal {
        grant(who);
        vm.prank(who);
        market.buyPrimary(INV, units);
    }

    function test_secondary_partialFillsThenClose() public {
        BondToken bond = list();
        _fund(alice, 1000e6);
        grant(bob);

        vm.startPrank(alice);
        bond.approve(address(market), type(uint256).max);
        uint256 askId = market.makeAsk(INV, 500e6, 9800);
        vm.stopPrank();

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(bob);
        market.fillAsk(askId, 200e6);
        assertEq(bond.balanceOf(bob), 200e6);
        assertEq(bond.balanceOf(alice), 800e6);
        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, 196e6);
        (,, uint256 left,) = market.asks(askId);
        assertEq(left, 300e6);

        vm.prank(bob);
        market.fillAsk(askId, 300e6);
        (, address maker,,) = market.asks(askId);
        assertEq(maker, address(0)); // closed
        assertEq(bond.balanceOf(bob), 500e6);
    }

    function test_secondary_fillByNonEligibleRevertsAtTokenLayer() public {
        BondToken bond = list();
        _fund(alice, 1000e6);
        vm.startPrank(alice);
        bond.approve(address(market), type(uint256).max);
        uint256 askId = market.makeAsk(INV, 500e6, 9800);
        vm.stopPrank();

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BondToken.NotEligible.selector, carol));
        market.fillAsk(askId, 100e6);
    }

    function test_secondary_cancelOnlyMaker() public {
        list();
        _fund(alice, 1000e6);
        vm.prank(alice);
        uint256 askId = market.makeAsk(INV, 500e6, 9800);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.NotMaker.selector, askId));
        market.cancelAsk(askId);

        vm.prank(alice);
        market.cancelAsk(askId);
        grant(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.UnknownAsk.selector, askId));
        market.fillAsk(askId, 1e6);
    }

    function test_makeAsk_requiresHoldings() public {
        list();
        grant(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.InsufficientUnits.selector, 1e6, 0));
        market.makeAsk(INV, 1e6, 9800);
    }

    // ---- admin ------------------------------------------------------------------------------

    function test_grantBondRole_passthrough() public {
        BondToken bond = list();
        address settlement = makeAddr("settlement");
        bytes32 role = bond.ISSUER_ROLE();
        vm.prank(owner);
        market.grantBondRole(INV, role, settlement);
        assertTrue(bond.hasRole(role, settlement));
    }

    function test_treasuryPaysNoFee() public {
        list();
        grant(treasury);
        usdc.mint(treasury, 1000e6);
        vm.startPrank(treasury);
        usdc.approve(address(market), type(uint256).max);
        market.buyPrimary(INV, 100e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(treasury), 1000e6 - 97e6); // cost only, no fee to itself
    }

    function test_revokeBondRole_passthrough() public {
        BondToken bond = list();
        bytes32 role = bond.COMPLIANCE_ROLE();
        vm.prank(owner);
        market.revokeBondRole(INV, role, compliance);
        assertFalse(bond.hasRole(role, compliance));
        vm.prank(compliance);
        vm.expectRevert();
        bond.setEligible(alice, true);
    }

    function test_setSettlement_grantsExistingBonds() public {
        BondToken bond = list();
        address settlement = makeAddr("settlement");
        vm.prank(owner);
        market.setSettlement(settlement);
        assertTrue(bond.hasRole(bond.ISSUER_ROLE(), settlement));
    }

    function test_setFee_requiresTreasuryWhenNonZero() public {
        vm.prank(owner);
        vm.expectRevert(InvoiceMarket.TreasuryRequired.selector);
        market.setFee(50, address(0));
        vm.prank(owner);
        market.setFee(0, address(0)); // fee off needs no treasury
    }

    function test_setFee_capped() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(InvoiceMarket.FeeTooHigh.selector, 501));
        market.setFee(501, treasury);
    }
}
