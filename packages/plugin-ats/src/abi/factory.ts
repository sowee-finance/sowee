/**
 * Minimal ABI fragments vendored from @hashgraph/asset-tokenization-contracts@8.0.0
 * (hardhat artifacts under artifacts/contracts/...). Vendored instead of importing the
 * package because its entry point is CommonJS typechain output (ethers-based) and the
 * 66MB artifact tree is not cleanly importable from ESM.
 */

export const factoryAbi = [
  {
    type: "function",
    name: "deployBond",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_bondData",
        type: "tuple",
        components: [
          {
            name: "security",
            type: "tuple",
            components: [
              {
                name: "resolver",
                type: "address",
              },
              {
                name: "maxSupply",
                type: "uint256",
              },
              {
                name: "resolverProxyConfiguration",
                type: "tuple",
                components: [
                  {
                    name: "key",
                    type: "bytes32",
                  },
                  {
                    name: "version",
                    type: "uint256",
                  },
                ],
              },
              {
                name: "erc20MetadataInfo",
                type: "tuple",
                components: [
                  {
                    name: "name",
                    type: "string",
                  },
                  {
                    name: "symbol",
                    type: "string",
                  },
                  {
                    name: "isin",
                    type: "string",
                  },
                  {
                    name: "decimals",
                    type: "uint8",
                  },
                ],
              },
              {
                name: "rbacs",
                type: "tuple[]",
                components: [
                  {
                    name: "role",
                    type: "bytes32",
                  },
                  {
                    name: "members",
                    type: "address[]",
                  },
                ],
              },
              {
                name: "externalPauses",
                type: "address[]",
              },
              {
                name: "externalControlLists",
                type: "address[]",
              },
              {
                name: "externalKycLists",
                type: "address[]",
              },
              {
                name: "compliance",
                type: "address",
              },
              {
                name: "identityRegistry",
                type: "address",
              },
              {
                name: "arePartitionsProtected",
                type: "bool",
              },
              {
                name: "isMultiPartition",
                type: "bool",
              },
              {
                name: "isControllable",
                type: "bool",
              },
              {
                name: "isWhiteList",
                type: "bool",
              },
              {
                name: "clearingActive",
                type: "bool",
              },
              {
                name: "internalKycActivated",
                type: "bool",
              },
              {
                name: "erc20VotesActivated",
                type: "bool",
              },
            ],
          },
          {
            name: "bondDetails",
            type: "tuple",
            components: [
              {
                name: "currency",
                type: "bytes3",
              },
              {
                name: "nominalValue",
                type: "uint256",
              },
              {
                name: "nominalValueDecimals",
                type: "uint8",
              },
              {
                name: "startingDate",
                type: "uint256",
              },
              {
                name: "maturityDate",
                type: "uint256",
              },
            ],
          },
          {
            name: "proceedRecipients",
            type: "address[]",
          },
          {
            name: "proceedRecipientsData",
            type: "bytes[]",
          },
        ],
      },
      {
        name: "_factoryRegulationData",
        type: "tuple",
        components: [
          {
            name: "regulationType",
            type: "uint8",
          },
          {
            name: "regulationSubType",
            type: "uint8",
          },
          {
            name: "additionalSecurityData",
            type: "tuple",
            components: [
              {
                name: "countriesControlListType",
                type: "bool",
              },
              {
                name: "listOfCountries",
                type: "string",
              },
              {
                name: "info",
                type: "string",
              },
            ],
          },
        ],
      },
    ],
    outputs: [
      {
        name: "bondAddress_",
        type: "address",
      },
    ],
  },
] as const;
