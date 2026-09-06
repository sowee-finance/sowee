/** The slices of the ATS ABI this integration uses, taken from the published artifacts. */

import assetArtifact from "@hashgraph/asset-tokenization-contracts/artifacts/contracts/facets/IAsset.sol/IAsset.json" with {
  type: "json",
}
import mintArtifact from "@hashgraph/asset-tokenization-contracts/artifacts/contracts/facets/mintByPartition/IMintByPartition.sol/IMintByPartition.json" with {
  type: "json",
}
import factoryArtifact from "@hashgraph/asset-tokenization-contracts/artifacts/contracts/factory/IFactory.sol/IFactory.json" with {
  type: "json",
}
import type { Abi } from "viem"

export const factoryAbi = factoryArtifact.abi as Abi
/** The bond diamond exposes every facet at one address; `IAsset` covers the reads and transfers. */
export const bondAbi = assetArtifact.abi as Abi
export const mintAbi = mintArtifact.abi as Abi

/** Facets whose ABIs `IAsset` does not carry. */
export const complianceAbi = [
  {
    type: "function",
    name: "grantKyc",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "string" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "revokeKyc",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "addToControlList",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isInControlList",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "addIssuer",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isIssuer",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const satisfies Abi
