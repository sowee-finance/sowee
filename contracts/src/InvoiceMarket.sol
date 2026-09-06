// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BondToken} from "./BondToken.sol";
import {DiscountOracle} from "./DiscountOracle.sol";

/// @title InvoiceMarket — primary funding and compliant secondary trading of invoice bonds.
/// @notice `listInvoice` consumes a signed discount quote and deploys a `BondToken` for the invoice.
/// Primary buys pay the issuer in USDC at the discounted price and mint units to the buyer.
/// Secondary asks settle USDC buyer→maker and move units maker→buyer through the token, so a
/// fill to a non-eligible buyer reverts at the token layer. USDC never sits in this contract.
contract InvoiceMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 500;

    struct Listing {
        BondToken bond;
        address issuer;
        uint256 faceValue;
        uint16 discountRateBps;
        uint64 maturity;
    }

    struct Ask {
        bytes32 invoiceId;
        address maker;
        uint256 units;
        /// @dev price per unit in bps of face (9_700 = 0.97 USDC per unit)
        uint256 priceBps;
    }

    IERC20 public immutable usdc;
    DiscountOracle public immutable oracle;

    /// @notice Receives `COMPLIANCE_ROLE` on every bond (the API's KYC operator).
    address public complianceOperator;
    /// @notice Receives `ISSUER_ROLE` on every bond so it can burn surrendered units.
    address public settlement;
    address public treasury;
    uint16 public feeBps;

    mapping(bytes32 invoiceId => Listing) internal _listings;
    bytes32[] public invoiceIds;

    mapping(uint256 askId => Ask) public asks;
    uint256 public nextAskId = 1;

    event InvoiceListed(
        bytes32 indexed invoiceId,
        address indexed bond,
        address indexed issuer,
        uint256 faceValue,
        uint16 discountRateBps,
        uint64 maturity
    );
    event PrimaryFunded(
        bytes32 indexed invoiceId, address indexed buyer, uint256 units, uint256 paid, uint256 fee
    );
    event AskMade(
        uint256 indexed askId,
        bytes32 indexed invoiceId,
        address indexed maker,
        uint256 units,
        uint256 priceBps
    );
    event AskCancelled(uint256 indexed askId);
    event AskFilled(
        uint256 indexed askId, address indexed taker, uint256 units, uint256 paid, uint256 fee
    );
    event FeeChanged(uint16 feeBps, address treasury);
    event ComplianceOperatorChanged(address operator);
    event SettlementChanged(address settlement);

    error AlreadyListed(bytes32 invoiceId);
    error UnknownInvoice(bytes32 invoiceId);
    error FundingClosed(bytes32 invoiceId);
    error ZeroAmount();
    error FeeTooHigh(uint16 feeBps);
    error UnknownAsk(uint256 askId);
    error NotMaker(uint256 askId);
    error InsufficientUnits(uint256 requested, uint256 available);

    constructor(
        IERC20 usdc_,
        DiscountOracle oracle_,
        address complianceOperator_,
        address treasury_,
        address owner_
    ) Ownable(owner_) {
        usdc = usdc_;
        oracle = oracle_;
        complianceOperator = complianceOperator_;
        treasury = treasury_;
    }

    // ---- admin ------------------------------------------------------------------------------

    function setFee(uint16 feeBps_, address treasury_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_);
        feeBps = feeBps_;
        treasury = treasury_;
        emit FeeChanged(feeBps_, treasury_);
    }

    function setComplianceOperator(address operator) external onlyOwner {
        complianceOperator = operator;
        emit ComplianceOperatorChanged(operator);
    }

    function setSettlement(address settlement_) external onlyOwner {
        settlement = settlement_;
        emit SettlementChanged(settlement_);
    }

    /// @notice Role passthrough: this contract is admin of every bond it deploys.
    function grantBondRole(bytes32 invoiceId, bytes32 role, address account) external onlyOwner {
        _listing(invoiceId).bond.grantRole(role, account);
    }

    // ---- primary ----------------------------------------------------------------------------

    /// @notice Open funding for an invoice. Deploys the bond and consumes the signed quote.
    function listInvoice(
        string calldata name,
        string calldata symbol,
        uint64 maturity,
        DiscountOracle.Quote calldata q,
        bytes calldata signature
    ) external returns (BondToken bond) {
        if (address(_listings[q.invoiceId].bond) != address(0)) {
            revert AlreadyListed(q.invoiceId);
        }
        if (q.faceValue == 0) revert ZeroAmount();
        if (maturity <= block.timestamp) revert FundingClosed(q.invoiceId);

        oracle.consume(q, signature);

        bond = new BondToken(name, symbol, q.invoiceId, q.faceValue, maturity, address(this));
        bond.grantRole(bond.COMPLIANCE_ROLE(), complianceOperator);
        bond.grantRole(bond.ISSUER_ROLE(), address(this));
        if (settlement != address(0)) bond.grantRole(bond.ISSUER_ROLE(), settlement);

        _listings[q.invoiceId] = Listing({
            bond: bond,
            issuer: msg.sender,
            faceValue: q.faceValue,
            discountRateBps: q.discountRateBps,
            maturity: maturity
        });
        invoiceIds.push(q.invoiceId);

        emit InvoiceListed(
            q.invoiceId, address(bond), msg.sender, q.faceValue, q.discountRateBps, maturity
        );
    }

    /// @notice Fund `units` of an invoice at the discounted price. USDC goes straight to the issuer.
    function buyPrimary(bytes32 invoiceId, uint256 units) external nonReentrant {
        Listing storage l = _listing(invoiceId);
        if (units == 0) revert ZeroAmount();
        if (block.timestamp >= l.maturity) revert FundingClosed(invoiceId);

        uint256 cost = Math.mulDiv(units, BPS - l.discountRateBps, BPS, Math.Rounding.Ceil);
        uint256 fee = _takeFee(msg.sender, cost);
        usdc.safeTransferFrom(msg.sender, l.issuer, cost);
        l.bond.mint(msg.sender, units);

        emit PrimaryFunded(invoiceId, msg.sender, units, cost, fee);
    }

    // ---- secondary --------------------------------------------------------------------------

    /// @notice Offer units for sale. Units stay with the maker; approve this contract on the bond.
    function makeAsk(bytes32 invoiceId, uint256 units, uint256 priceBps)
        external
        returns (uint256 askId)
    {
        Listing storage l = _listing(invoiceId);
        if (units == 0 || priceBps == 0) revert ZeroAmount();
        uint256 held = l.bond.balanceOf(msg.sender);
        if (held < units) revert InsufficientUnits(units, held);

        askId = nextAskId++;
        asks[askId] =
            Ask({invoiceId: invoiceId, maker: msg.sender, units: units, priceBps: priceBps});
        emit AskMade(askId, invoiceId, msg.sender, units, priceBps);
    }

    function cancelAsk(uint256 askId) external {
        Ask storage a = asks[askId];
        if (a.maker == address(0)) revert UnknownAsk(askId);
        if (a.maker != msg.sender) revert NotMaker(askId);
        delete asks[askId];
        emit AskCancelled(askId);
    }

    /// @notice Buy `units` from an ask. Reverts at the token layer if the taker is not eligible.
    function fillAsk(uint256 askId, uint256 units) external nonReentrant {
        Ask storage a = asks[askId];
        if (a.maker == address(0)) revert UnknownAsk(askId);
        if (units == 0) revert ZeroAmount();
        if (units > a.units) revert InsufficientUnits(units, a.units);

        uint256 cost = Math.mulDiv(units, a.priceBps, BPS, Math.Rounding.Ceil);
        uint256 fee = _takeFee(msg.sender, cost);
        usdc.safeTransferFrom(msg.sender, a.maker, cost);
        _listings[a.invoiceId].bond.transferFrom(a.maker, msg.sender, units);

        a.units -= units;
        if (a.units == 0) delete asks[askId];
        emit AskFilled(askId, msg.sender, units, cost, fee);
    }

    // ---- views ------------------------------------------------------------------------------

    function listing(bytes32 invoiceId) external view returns (Listing memory) {
        return _listing(invoiceId);
    }

    function bondOf(bytes32 invoiceId) external view returns (BondToken) {
        return _listing(invoiceId).bond;
    }

    function listingCount() external view returns (uint256) {
        return invoiceIds.length;
    }

    /// @notice USDC due for `units` on the primary market, fee excluded.
    function primaryCost(bytes32 invoiceId, uint256 units) external view returns (uint256) {
        return
            Math.mulDiv(units, BPS - _listing(invoiceId).discountRateBps, BPS, Math.Rounding.Ceil);
    }

    // ---- internal ---------------------------------------------------------------------------

    function _listing(bytes32 invoiceId) internal view returns (Listing storage l) {
        l = _listings[invoiceId];
        if (address(l.bond) == address(0)) revert UnknownInvoice(invoiceId);
    }

    function _takeFee(address payer, uint256 cost) internal returns (uint256 fee) {
        // HTS rejects a transfer from an account to itself, so the treasury trades fee-free.
        if (feeBps == 0 || payer == treasury) return 0;
        fee = Math.mulDiv(cost, feeBps, BPS, Math.Rounding.Ceil);
        usdc.safeTransferFrom(payer, treasury, fee);
    }
}
