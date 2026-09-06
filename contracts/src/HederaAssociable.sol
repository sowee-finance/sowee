// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Minimal slice of the Hedera Token Service precompile.
interface IHederaTokenService {
    function associateToken(address account, address token) external returns (int64 responseCode);
}

/// @title HederaAssociable — associates this contract with an HTS token when running on Hedera.
/// @notice HTS tokens (USDC on Hedera is one) can only be received by associated accounts. On any
/// other chain the call is skipped so the same bytecode deploys unchanged elsewhere.
abstract contract HederaAssociable {
    address internal constant HTS = address(0x167);
    int64 internal constant HTS_SUCCESS = 22;
    int64 internal constant HTS_ALREADY_ASSOCIATED = 194;

    event TokenAssociated(address indexed token);

    error AssociationFailed(int64 responseCode);

    function _isHedera() internal view returns (bool) {
        return block.chainid == 295 || block.chainid == 296 || block.chainid == 297;
    }

    function _associateIfHedera(address token) internal {
        if (!_isHedera()) return;
        (bool ok, bytes memory ret) = HTS.call(
            abi.encodeWithSelector(
                IHederaTokenService.associateToken.selector, address(this), token
            )
        );
        int64 rc = (ok && ret.length >= 32) ? abi.decode(ret, (int64)) : int64(-1);
        if (rc != HTS_SUCCESS && rc != HTS_ALREADY_ASSOCIATED) revert AssociationFailed(rc);
        emit TokenAssociated(token);
    }
}
