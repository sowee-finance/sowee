package hcs

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
)

// MirrorBase is the public testnet mirror node.
const MirrorBase = "https://testnet.mirrornode.hedera.com"

// FetchTopicMessages reads every message of a topic from the mirror node, oldest first.
func FetchTopicMessages(ctx context.Context, base, topicID string) ([][]byte, error) {
	var out [][]byte
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
				Message string `json:"message"`
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
			raw, err := base64.StdEncoding.DecodeString(m.Message)
			if err != nil {
				continue
			}
			out = append(out, raw)
		}
		next = ""
		if page.Links.Next != nil {
			next = *page.Links.Next
		}
	}
	return out, nil
}
