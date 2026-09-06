import { skipToken, useQuery } from "@tanstack/react-query"
import type { Hex } from "viem"
import { fetchTopic, hcsAvailable, logoFor, topicId } from "./hcs"

/** Every message on the audit-trail topic, newest first; disabled off Hedera. */
export function useTopic() {
  return useQuery({
    queryKey: ["hcs", topicId],
    queryFn: hcsAvailable ? () => fetchTopic() : skipToken,
    staleTime: 30_000,
  })
}

/** The issuer's logo for one bond, read off the same cached topic the audit trail uses. */
export function useLogo(invoiceId: Hex) {
  const { data } = useTopic()
  return data && logoFor(data, invoiceId)
}
