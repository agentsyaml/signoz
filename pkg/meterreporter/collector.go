package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// Window is the reporting window a Collector produces readings for. Timestamps
// are unix milliseconds; BucketStartMs is the emitted reading's Timestamp and
// typically aligns to UTC day start.
type Window struct {
	StartMs       uint64
	EndMs         uint64
	BucketStartMs int64 // ! See if this can be removed
}

// Collector produces readings for a single Meter. Implementations are
// stateless — the Meter carries all per-meter configuration — so a single
// Collector instance may be shared across every entry in the registry.
//
// Collect must be safe to call concurrently across orgs.
type Collector interface {
	Collect(ctx context.Context, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error)
}
