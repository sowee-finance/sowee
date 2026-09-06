import { skipToken, useQuery } from "@tanstack/react-query"
import { fetchTopic, hcsAvailable, topicId } from "./hcs"

/** Every message on the audit-trail topic, newest first; disabled off Hedera. */
export function useTopic() {
  return useQuery({
    queryKey: ["hcs", topicId],
    queryFn: hcsAvailable ? () => fetchTopic() : skipToken,
    staleTime: 30_000,
  })
}
