// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DiscountOracle — pull oracle for invoice discount rates.
/// @notice The API prices an invoice off-chain and signs an EIP-712 `Quote`. The market submits the
/// quote with `listInvoice`; this contract checks signer, expiry and nonce, then consumes the nonce so
/// a quote can only ever open one listing. No live price feed is needed for pricing.
contract DiscountOracle is EIP712, Ownable {
    struct Quote {
        bytes32 invoiceId;
        uint256 faceValue;
        uint16 discountRateBps;
        uint64 validUntil;
        uint64 nonce;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 invoiceId,uint256 faceValue,uint16 discountRateBps,uint64 validUntil,uint64 nonce)"
    );
    uint16 public constant MAX_RATE_BPS = 5000;

    /// @notice Address whose signatures are accepted.
    address public signer;
    /// @notice Only this address may consume quotes (the InvoiceMarket).
    address public consumer;
    mapping(uint64 nonce => bool used) public nonceUsed;

    event SignerChanged(address indexed signer);
    event ConsumerChanged(address indexed consumer);
    event QuoteConsumed(bytes32 indexed invoiceId, uint16 discountRateBps, uint64 nonce);

    error QuoteExpired(uint64 validUntil);
    error NonceUsed(uint64 nonce);
    error BadSigner(address recovered);
    error RateTooHigh(uint16 rateBps);
    error NotConsumer(address caller);

    constructor(address signer_, address owner_)
        EIP712("SoweeDiscountOracle", "1")
        Ownable(owner_)
    {
        signer = signer_;
        emit SignerChanged(signer_);
    }

    function setSigner(address signer_) external onlyOwner {
        signer = signer_;
        emit SignerChanged(signer_);
    }

    function setConsumer(address consumer_) external onlyOwner {
        consumer = consumer_;
        emit ConsumerChanged(consumer_);
    }

    /// @notice EIP-712 digest of a quote, exposed so clients can sign/verify against the same bytes.
    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    q.invoiceId,
                    q.faceValue,
                    q.discountRateBps,
                    q.validUntil,
                    q.nonce
                )
            )
        );
    }

    /// @notice Stateless check. Reverts with the reason a quote would be rejected.
    function verify(Quote calldata q, bytes calldata signature) public view {
        if (q.discountRateBps > MAX_RATE_BPS) revert RateTooHigh(q.discountRateBps);
        if (block.timestamp > q.validUntil) revert QuoteExpired(q.validUntil);
        if (nonceUsed[q.nonce]) revert NonceUsed(q.nonce);
        address recovered = ECDSA.recover(hashQuote(q), signature);
        if (recovered != signer) revert BadSigner(recovered);
    }

    /// @notice Verify and burn the nonce. Only the configured consumer may call.
    function consume(Quote calldata q, bytes calldata signature) external {
        if (msg.sender != consumer) revert NotConsumer(msg.sender);
        verify(q, signature);
        nonceUsed[q.nonce] = true;
        emit QuoteConsumed(q.invoiceId, q.discountRateBps, q.nonce);
    }
}
