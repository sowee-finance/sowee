package hcs

import (
	"context"
	"fmt"

	hiero "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"
)

// HieroSubmitter writes to HCS with the Hiero SDK using one operator account.
type HieroSubmitter struct {
	client  *hiero.Client
	topicID hiero.TopicID
}

// NewClient builds a testnet client for the operator (ECDSA hex key, as used by the deployer).
func NewClient(operatorID, operatorKeyHex string) (*hiero.Client, error) {
	id, err := hiero.AccountIDFromString(operatorID)
	if err != nil {
		return nil, fmt.Errorf("HEDERA_OPERATOR_ID: %w", err)
	}
	key, err := hiero.PrivateKeyFromStringECDSA(operatorKeyHex)
	if err != nil {
		return nil, fmt.Errorf("HEDERA_OPERATOR_KEY: %w", err)
	}
	client := hiero.ClientForTestnet()
	client.SetOperator(id, key)
	return client, nil
}

// CreateTopic makes a new topic that only the operator may write to (submit key) and returns
// its id. Reads stay public.
func CreateTopic(client *hiero.Client, memo string) (string, error) {
	resp, err := hiero.NewTopicCreateTransaction().
		SetTopicMemo(memo).
		SetSubmitKey(client.GetOperatorPublicKey()).
		Execute(client)
	if err != nil {
		return "", fmt.Errorf("topic create: %w", err)
	}
	receipt, err := resp.GetReceipt(client)
	if err != nil {
		return "", fmt.Errorf("topic create receipt: %w", err)
	}
	return receipt.TopicID.String(), nil
}

// NewHieroSubmitter binds a client to an existing topic.
func NewHieroSubmitter(client *hiero.Client, topicID string) (*HieroSubmitter, error) {
	id, err := hiero.TopicIDFromString(topicID)
	if err != nil {
		return nil, fmt.Errorf("HCS_TOPIC_ID: %w", err)
	}
	return &HieroSubmitter{client: client, topicID: id}, nil
}

// Submit implements Submitter.
func (s *HieroSubmitter) Submit(_ context.Context, message []byte) (uint64, error) {
	resp, err := hiero.NewTopicMessageSubmitTransaction().
		SetTopicID(s.topicID).
		SetMessage(message).
		Execute(s.client)
	if err != nil {
		return 0, err
	}
	receipt, err := resp.GetReceipt(s.client)
	if err != nil {
		return 0, err
	}
	return receipt.TopicSequenceNumber, nil
}
