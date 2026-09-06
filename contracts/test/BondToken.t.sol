// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BondToken} from "../src/BondToken.sol";

contract BondTokenTest is Test {
    BondToken bond;

    address admin = makeAddr("admin");
    address compliance = makeAddr("compliance");
    address issuer = makeAddr("issuer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant FACE = 10_000e6;

    function setUp() public {
        bond = new BondToken(
            "Sowee Bond INV-1",
            "sINV1",
            keccak256("INV-1"),
            FACE,
            uint64(block.timestamp + 30 days),
            admin
        );
        vm.startPrank(admin);
        bond.grantRole(bond.COMPLIANCE_ROLE(), compliance);
        bond.grantRole(bond.ISSUER_ROLE(), issuer);
        vm.stopPrank();
    }

    function test_metadata() public view {
        assertEq(bond.decimals(), 6);
        assertEq(bond.faceValue(), FACE);
        assertEq(bond.invoiceId(), keccak256("INV-1"));
    }

    function test_mintToNonEligibleReverts() public {
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(BondToken.NotEligible.selector, alice));
        bond.mint(alice, 100e6);
    }

    function test_transferToNonEligibleReverts_thenGrant_thenRevoke() public {
        vm.prank(compliance);
        bond.setEligible(alice, true);
        vm.prank(issuer);
        bond.mint(alice, 100e6);

        // bob not granted -> revert at the token layer
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BondToken.NotEligible.selector, bob));
        bond.transfer(bob, 40e6);

        // grant bob -> transfer succeeds
        vm.prank(compliance);
        bond.setEligible(bob, true);
        vm.prank(alice);
        bond.transfer(bob, 40e6);
        assertEq(bond.balanceOf(bob), 40e6);

        // revoke bob -> transfers to bob revert again
        vm.prank(compliance);
        bond.setEligible(bob, false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BondToken.NotEligible.selector, bob));
        bond.transfer(bob, 1e6);
    }

    function test_frozenCannotSend_butCanBeBurned() public {
        vm.startPrank(compliance);
        bond.setEligible(alice, true);
        bond.setEligible(bob, true);
        vm.stopPrank();
        vm.prank(issuer);
        bond.mint(alice, 100e6);

        vm.prank(compliance);
        bond.setFrozen(alice, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BondToken.Frozen.selector, alice));
        bond.transfer(bob, 1e6);

        // freeze blocks every movement, burns included; compliance must unfreeze before an exit
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(BondToken.Frozen.selector, alice));
        bond.burn(alice, 1e6);
    }

    function test_mintCappedAtFaceValue() public {
        vm.prank(compliance);
        bond.setEligible(alice, true);
        vm.startPrank(issuer);
        bond.mint(alice, FACE);
        vm.expectRevert(abi.encodeWithSelector(BondToken.ExceedsFaceValue.selector, 1, 0));
        bond.mint(alice, 1);
        vm.stopPrank();
    }

    function test_burnRequiresIssuerRole() public {
        vm.prank(compliance);
        bond.setEligible(alice, true);
        vm.prank(issuer);
        bond.mint(alice, 10e6);

        bytes32 role = bond.ISSUER_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role
            )
        );
        bond.burn(alice, 10e6);

        vm.prank(issuer);
        bond.burn(alice, 10e6);
        assertEq(bond.totalSupply(), 0);
    }

    function test_onlyComplianceCanGrant() public {
        bytes32 role = bond.COMPLIANCE_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role
            )
        );
        bond.setEligible(alice, true);
    }
}
