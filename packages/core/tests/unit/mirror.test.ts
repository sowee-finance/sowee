import { describe, expect, it, vi } from "vitest";
import { MirrorNodeClient, MirrorNodeError } from "../../src/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MirrorNodeClient", () => {
  it("fetches token info from the right URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ token_id: "0.0.429274", symbol: "USDC" }));
    const client = new MirrorNodeClient({ fetch: fetchMock as unknown as typeof fetch });
    const info = await client.getTokenInfo("0.0.429274");
    expect(info.symbol).toBe("USDC");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.429274",
      expect.anything(),
    );
  });

  it("throws MirrorNodeError on non-2xx", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ _status: "not found" }, 404));
    const client = new MirrorNodeClient({ fetch: fetchMock as unknown as typeof fetch });
    await expect(client.getAccount("0.0.1")).rejects.toThrow(MirrorNodeError);
    await expect(client.getAccount("0.0.1")).rejects.toMatchObject({ status: 404 });
  });

  it("paginate follows absolute next links against the origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ items: [1, 2], links: { next: "/api/v1/things?page=2" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [3], links: { next: null } }));
    const client = new MirrorNodeClient({ fetch: fetchMock as unknown as typeof fetch });
    const seen: number[] = [];
    for await (const n of client.paginate<{ items: number[] }, number>("things", (p) => p.items)) {
      seen.push(n);
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://testnet.mirrornode.hedera.com/api/v1/things?page=2",
      expect.anything(),
    );
  });

  it("base64-decodes topic messages", async () => {
    const payload = Buffer.from('{"hello":"world"}', "utf8").toString("base64");
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        messages: [
          {
            consensus_timestamp: "1.2",
            sequence_number: 1,
            topic_id: "0.0.5",
            message: payload,
          },
        ],
      }),
    );
    const client = new MirrorNodeClient({ fetch: fetchMock as unknown as typeof fetch });
    const [msg] = await client.getTopicMessages("0.0.5", { limit: 1, order: "asc" });
    expect(msg?.message).toBe('{"hello":"world"}');
    expect(fetchMock).toHaveBeenCalledWith(
      "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.5/messages?limit=1&order=asc",
      expect.anything(),
    );
  });

  it("contractCall POSTs to /contracts/call and returns result", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: "0x01" }));
    const client = new MirrorNodeClient({ fetch: fetchMock as unknown as typeof fetch });
    const result = await client.contractCall({
      to: "0x00000000000000000000000000000000008c964f",
      data: "0x12345678",
    });
    expect(result).toBe("0x01");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://testnet.mirrornode.hedera.com/api/v1/contracts/call");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ data: "0x12345678", estimate: false });
  });
});
