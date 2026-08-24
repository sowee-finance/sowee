/**
 * Minimal ABI fragments vendored from @hashgraph/asset-tokenization-contracts@8.0.0
 * (hardhat artifacts under artifacts/contracts/...). Vendored instead of importing the
 * package because its entry point is CommonJS typechain output (ethers-based) and the
 * 66MB artifact tree is not cleanly importable from ESM.
 */

export const kycFacetAbi = [
  {
    type: "function",
    name: "grantKyc",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_account",
        type: "address",
      },
      {
        name: "_vcId",
        type: "string",
      },
      {
        name: "_validFrom",
        type: "uint256",
      },
      {
        name: "_validTo",
        type: "uint256",
      },
      {
        name: "_issuer",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "revokeKyc",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
] as const;

export const controlListFacetAbi = [
  {
    type: "function",
    name: "addToControlList",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "removeFromControlList",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
] as const;

export const freezeFacetAbi = [
  {
    type: "function",
    name: "freezePartialTokens",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_userAddress",
        type: "address",
      },
      {
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unfreezePartialTokens",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_userAddress",
        type: "address",
      },
      {
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
  },
] as const;

export const pauseFacetAbi = [
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      {
        name: "success_",
        type: "bool",
      },
    ],
  },
] as const;

export const snapshotsFacetAbi = [
  {
    type: "function",
    name: "takeSnapshot",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      {
        name: "snapshotID_",
        type: "uint256",
      },
    ],
  },
] as const;

export const balanceTrackerAtSnapshotFacetAbi = [
  {
    type: "function",
    name: "balanceOfAtSnapshot",
    stateMutability: "view",
    inputs: [
      {
        name: "_snapshotID",
        type: "uint256",
      },
      {
        name: "_tokenHolder",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "balance_",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "totalSupplyAtSnapshot",
    stateMutability: "view",
    inputs: [
      {
        name: "_snapshotID",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "totalSupply_",
        type: "uint256",
      },
    ],
  },
] as const;

export const maturityFacetAbi = [
  {
    type: "function",
    name: "redeemAtMaturityByPartition",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_tokenHolder",
        type: "address",
      },
      {
        name: "_partition",
        type: "bytes32",
      },
      {
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
  },
] as const;

export const controllerFacetAbi = [
  {
    type: "function",
    name: "controllerTransfer",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_from",
        type: "address",
      },
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
      {
        name: "_data",
        type: "bytes",
      },
      {
        name: "_operatorData",
        type: "bytes",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "controllerRedeem",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_tokenHolder",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
      {
        name: "_data",
        type: "bytes",
      },
      {
        name: "_operatorData",
        type: "bytes",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "forcedTransfer",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_from",
        type: "address",
      },
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
] as const;
