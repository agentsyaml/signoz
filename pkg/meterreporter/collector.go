package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/telemetrystore"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// Window is the time range a collector produces readings for. StartMs is the
// filter lower bound *and* the emitted Reading.Timestamp — callers align it to
// UTC day start so repeat ticks within the same day UPSERT cleanly at Zeus.
type Window struct {
	StartMs int64
	EndMs   int64
}

// CollectorDeps is the shared dependency bag handed to every collector. Each
// collector reaches for the subset it needs (logs/metrics/traces meters all
// read from ClickHouse; retention dimensions come from sqlstore).
type CollectorDeps struct {
	TelemetryStore telemetrystore.TelemetryStore
	SQLStore       sqlstore.SQLStore
}

// CollectorFunc turns one registered Meter into zero or more Readings for the
// given org and window. Returning an error signals tick-level failure for this
// meter only — the caller keeps iterating the rest.
type CollectorFunc func(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error)
