// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Stand-in for the Hedera Token Service precompile at 0x167. Records associations.
contract MockHTS {
    mapping(address account => mapping(address token => bool)) public associated;
    /// @dev 0 means "answer SUCCESS (22)". Kept as an override so etched copies (empty storage) work.
    int64 public responseOverride;

    function setNextResponse(int64 rc) external {
        responseOverride = rc;
    }

    function associateToken(address account, address token) external returns (int64) {
        associated[account][token] = true;
        return responseOverride == 0 ? int64(22) : responseOverride;
    }
}
