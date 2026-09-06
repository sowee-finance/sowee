import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import type {
  Abi,
  Address,
  ContractFunctionArgs,
  ContractFunctionName,
  Hex,
  SimulateContractParameters,
} from "viem"
import { usePublicClient, useWaitForTransactionReceipt, useWalletClient } from "wagmi"
import { activeChain } from "./chains"
import { describeError } from "./errors"

type Mutable = "nonpayable" | "payable"

export type Call<abi extends Abi, fn extends ContractFunctionName<abi, Mutable>> = {
  address: Address
  abi: abi
  functionName: fn
  args: ContractFunctionArgs<abi, Mutable, fn>
}

/**
 * Simulate against the active chain first, so a revert surfaces as a readable message instead
 * of an opaque wallet error, then send from the wallet and wait for the receipt.
 */
export function useTx() {
  const client = usePublicClient({ chainId: activeChain.id })
  const { data: wallet } = useWalletClient({ chainId: activeChain.id })
  const queryClient = useQueryClient()
  const [hash, setHash] = useState<Hex>()
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const receipt = useWaitForTransactionReceipt({ chainId: activeChain.id, hash })

  useEffect(() => {
    // Every confirmed write moves balances, allowances, asks or listings: refetch all reads.
    if (receipt.isSuccess) queryClient.invalidateQueries()
  }, [receipt.isSuccess, queryClient])

  async function send<const abi extends Abi, fn extends ContractFunctionName<abi, Mutable>>(
    call: Call<abi, fn>,
  ): Promise<Hex | undefined> {
    if (!client || !wallet) {
      setError(`Connect a wallet on ${activeChain.name}.`)
      return
    }
    setError(undefined)
    setHash(undefined)
    setSending(true)
    try {
      // The generic `call` keeps call sites typed; viem's request/write pairing only lines up on
      // the wide types, so widen here.
      const { request } = await client.simulateContract({
        ...(call as SimulateContractParameters),
        account: wallet.account,
        chain: activeChain,
      })
      const h = await wallet.writeContract(request)
      setHash(h)
      return h
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSending(false)
    }
  }

  return {
    send,
    hash,
    receipt,
    error,
    busy: sending || (!!hash && receipt.isPending),
    confirmed: receipt.isSuccess,
  }
}
