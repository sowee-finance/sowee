// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BondToken — fractional invoice bond with a KYC allowlist enforced at the token layer.
/// @notice One unit = 1 USDC of face value (6 decimals). Every transfer, including mint, requires the
/// recipient to be eligible; frozen accounts cannot send. Eligibility is *status only*: no personal
/// data or hashes are stored on-chain, just the decision for a wallet.
contract BondToken is ERC20, AccessControl {
    /// @dev Grants and revokes eligibility, freezes accounts. Held by the compliance operator (API).
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    /// @dev Mints on primary funding and burns on settlement. Held by market and settlement contracts.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    bytes32 public immutable invoiceId;
    /// @notice Face value in USDC base units; also the hard cap on total supply.
    uint256 public immutable faceValue;
    /// @notice Unix timestamp after which the invoice is due.
    uint64 public immutable maturity;

    mapping(address account => bool) public isEligible;
    mapping(address account => bool) public isFrozen;

    event EligibilityChanged(address indexed account, bool eligible);
    event FrozenChanged(address indexed account, bool frozen);

    error NotEligible(address account);
    error Frozen(address account);
    error ExceedsFaceValue(uint256 requested, uint256 available);

    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 invoiceId_,
        uint256 faceValue_,
        uint64 maturity_,
        address admin
    ) ERC20(name_, symbol_) {
        invoiceId = invoiceId_;
        faceValue = faceValue_;
        maturity = maturity_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ---- compliance -------------------------------------------------------------------------

    function setEligible(address account, bool eligible) external onlyRole(COMPLIANCE_ROLE) {
        isEligible[account] = eligible;
        emit EligibilityChanged(account, eligible);
    }

    function setFrozen(address account, bool frozen) external onlyRole(COMPLIANCE_ROLE) {
        isFrozen[account] = frozen;
        emit FrozenChanged(account, frozen);
    }

    // ---- lifecycle --------------------------------------------------------------------------

    function mint(address to, uint256 units) external onlyRole(ISSUER_ROLE) {
        uint256 available = faceValue - totalSupply();
        if (units > available) revert ExceedsFaceValue(units, available);
        _mint(to, units);
    }

    function burn(address from, uint256 units) external onlyRole(ISSUER_ROLE) {
        _burn(from, units);
    }

    // ---- transfer hook ----------------------------------------------------------------------

    /// @dev Runs on mint, burn and transfer. Burns (to == 0) are always allowed so holders can
    /// always exit at settlement; frozen accounts cannot move units anywhere.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && isFrozen[from]) revert Frozen(from);
        if (to != address(0) && !isEligible[to]) revert NotEligible(to);
        super._update(from, to, value);
    }
}
