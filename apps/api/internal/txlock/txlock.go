// Package txlock serialises transactions per sending key so two services sharing one account
// (granter and faucet) never race on the nonce.
package txlock

import "sync"

var (
	mu    sync.Mutex
	locks = map[string]*sync.Mutex{}
)

// Lock takes the lock for a sender and returns the release function.
func Lock(sender string) func() {
	mu.Lock()
	l := locks[sender]
	if l == nil {
		l = &sync.Mutex{}
		locks[sender] = l
	}
	mu.Unlock()
	l.Lock()
	return l.Unlock
}
