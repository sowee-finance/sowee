package hcs

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
)

// MirrorBase is the public testnet mirror node.
const MirrorBase = "https://testnet.mirrornode.hedera.com"

// FetchTopicMessages reads every message of a topic from the mirror node, oldest first. When
// payer is set, only messages paid for by that account are returned: the topic is public, so
// anything else could be a forged attestation meant to poison the double-pledge index.
func FetchTopicMessages(ctx context.Context, base, topicID, payer string) ([][]byte, error) {
	var out [][]byte
	// Chunks of one submission, keyed by the transaction that started it, kept in the order
	// their first chunk appeared so the trail stays chronological.
	parts := map[string][][]byte{}
	var order []string
	next := fmt.Sprintf("/api/v1/topics/%s/messages?limit=100&order=asc", topicID)
	for next != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+next, nil)
		if err != nil {
			return nil, err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("mirror node: %w", err)
		}
		var page struct {
			Messages []struct {
				Message   string `json:"message"`
				Payer     string `json:"payer_account_id"`
				ChunkInfo *struct {
					InitialTransactionID struct {
						AccountID             string `json:"account_id"`
						Nonce                 int    `json:"nonce"`
						TransactionValidStart string `json:"transaction_valid_start"`
					} `json:"initial_transaction_id"`
					Number int `json:"number"`
					Total  int `json:"total"`
				} `json:"chunk_info"`
			} `json:"messages"`
			Links struct {
				Next *string `json:"next"`
			} `json:"links"`
		}
		err = json.NewDecoder(resp.Body).Decode(&page)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("mirror node decode: %w", err)
		}
		for _, m := range page.Messages {
			if payer != "" && m.Payer != payer {
				continue
			}
			raw, err := base64.StdEncoding.DecodeString(m.Message)
			if err != nil {
				continue
			}
			// A submission over 1 KB is split across several consensus messages. Each one is a
			// slice of bytes, not a record, so it has to be put back together before anything
			// tries to read it — a logo makes three of them.
			c := m.ChunkInfo
			if c == nil || c.Total <= 1 {
				out = append(out, raw)
				continue
			}
			key := fmt.Sprintf("%s@%s/%d", c.InitialTransactionID.AccountID,
				c.InitialTransactionID.TransactionValidStart, c.InitialTransactionID.Nonce)
			if _, seen := parts[key]; !seen {
				order = append(order, key)
				parts[key] = make([][]byte, c.Total)
			}
			if c.Number >= 1 && c.Number <= len(parts[key]) {
				parts[key][c.Number-1] = raw
			}
		}
		next = ""
		if page.Links.Next != nil {
			next = *page.Links.Next
		}
	}
	for _, key := range order {
		whole, complete := bytes.Join(parts[key], nil), true
		for _, p := range parts[key] {
			if p == nil {
				complete = false // a chunk the mirror node has not served yet
			}
		}
		if complete {
			out = append(out, whole)
		}
	}
	return out, nil
}
