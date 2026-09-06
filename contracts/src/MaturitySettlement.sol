// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BondToken} from "./BondToken.sol";
import {InvoiceMarket} from "./InvoiceMarket.sol";
import {HederaAssociable} from "./HederaAssociable.sol";

/// @title MaturitySettlement — repayment escrow and pro-rata claims for matured invoice bonds.
/// @notice The payor (or issuer) deposits USDC against an invoice. Once the bond has matured anyone
/// may `settle`, which freezes the supply snapshot. Holders then `claim`: their units are burned and
/// they receive `repayment × units / supplySnapshot`. Claims are pull-based and burn on payout, so a
/// double claim is impossible by construction and no loop can run out of gas.
contract MaturitySettlement is ReentrancyGuard, HederaAssociable {
    using SafeERC20 for IERC20;

    struct Repayment {
        uint256 amount;
        uint256 supplySnapshot;
        bool settled;
    }

    /// @notice After maturity + grace, anyone may settle whatever was repaid.
    uint64 public constant GRACE = 7 days;

    IERC20 public immutable usdc;
    InvoiceMarket public immutable market;

    mapping(bytes32 invoiceId => Repayment) public repayments;
    mapping(bytes32 invoiceId => mapping(address payer => uint256)) public deposits;

    event RepaymentRegistered(
        bytes32 indexed invoiceId, address indexed payer, uint256 amount, uint256 total
    );
    event Settled(bytes32 indexed invoiceId, uint256 amount, uint256 supplySnapshot);
    event Claimed(bytes32 indexed invoiceId, address indexed holder, uint256 units, uint256 payout);
    event RepaymentWithdrawn(bytes32 indexed invoiceId, address indexed payer, uint256 amount);

    error ZeroAmount();
    error NotMatured(uint64 maturity);
    error NothingRepaid(bytes32 invoiceId);
    error AlreadySettled(bytes32 invoiceId);
    error NotSettled(bytes32 invoiceId);
    error NothingToClaim(address holder);
    error NothingToSettle(bytes32 invoiceId);
    error SettleNotOpen(bytes32 invoiceId);
    error NothingToWithdraw(address payer);
    error UnitsOutstanding(bytes32 invoiceId);

    constructor(IERC20 usdc_, InvoiceMarket market_) {
        usdc = usdc_;
        market = market_;
        _associateIfHedera(address(usdc_));
    }

    /// @notice Deposit USDC toward an invoice. Callable by anyone (payor, issuer, guarantor).
    function registerRepayment(bytes32 invoiceId, uint256 amount) external nonReentrant {
        market.bondOf(invoiceId); // reverts UnknownInvoice
        if (amount == 0) revert ZeroAmount();
        Repayment storage r = repayments[invoiceId];
        if (r.settled) revert AlreadySettled(invoiceId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        r.amount += amount;
        deposits[invoiceId][msg.sender] += amount;
        emit RepaymentRegistered(invoiceId, msg.sender, amount, r.amount);
    }

    /// @notice Freezes the supply snapshot for claims. Open to anyone once holders are fully
    /// covered (repayment >= outstanding units) or after maturity + grace; the issuer may settle a
    /// partial repayment as soon as the bond matures. Never settles a bond nobody holds.
    function settle(bytes32 invoiceId) external {
        BondToken bond = market.bondOf(invoiceId);
        Repayment storage r = repayments[invoiceId];
        uint64 maturity = bond.maturity();
        if (block.timestamp < maturity) revert NotMatured(maturity);
        if (r.settled) revert AlreadySettled(invoiceId);
        if (r.amount == 0) revert NothingRepaid(invoiceId);
        uint256 supply = bond.totalSupply();
        if (supply == 0) revert NothingToSettle(invoiceId);
        bool covered = r.amount >= supply;
        bool grace = block.timestamp >= maturity + GRACE;
        if (!covered && !grace && msg.sender != market.listing(invoiceId).issuer) {
            revert SettleNotOpen(invoiceId);
        }
        r.supplySnapshot = supply;
        r.settled = true;
        emit Settled(invoiceId, r.amount, r.supplySnapshot);
    }

    /// @notice A payer takes back a deposit that can never be claimed: the bond matured with no
    /// units outstanding (nothing was funded, or every holder already exited) and is unsettled.
    function withdrawRepayment(bytes32 invoiceId) external nonReentrant {
        BondToken bond = market.bondOf(invoiceId);
        Repayment storage r = repayments[invoiceId];
        if (r.settled) revert AlreadySettled(invoiceId);
        if (block.timestamp < bond.maturity()) revert NotMatured(bond.maturity());
        if (bond.totalSupply() != 0) revert UnitsOutstanding(invoiceId);
        uint256 amount = deposits[invoiceId][msg.sender];
        if (amount == 0) revert NothingToWithdraw(msg.sender);
        deposits[invoiceId][msg.sender] = 0;
        r.amount -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit RepaymentWithdrawn(invoiceId, msg.sender, amount);
    }

    /// @notice Surrender all units held and receive the pro-rata share of the repayment.
    function claim(bytes32 invoiceId) external nonReentrant {
        BondToken bond = market.bondOf(invoiceId);
        Repayment storage r = repayments[invoiceId];
        if (!r.settled) revert NotSettled(invoiceId);
        uint256 units = bond.balanceOf(msg.sender);
        if (units == 0) revert NothingToClaim(msg.sender);
        uint256 payout = Math.mulDiv(r.amount, units, r.supplySnapshot);
        bond.burn(msg.sender, units);
        usdc.safeTransfer(msg.sender, payout);
        emit Claimed(invoiceId, msg.sender, units, payout);
    }

    function claimable(bytes32 invoiceId, address holder) external view returns (uint256) {
        Repayment storage r = repayments[invoiceId];
        if (!r.settled) return 0;
        return Math.mulDiv(r.amount, market.bondOf(invoiceId).balanceOf(holder), r.supplySnapshot);
    }
}
