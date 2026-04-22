package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/telemetrystore"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// Window is the time range a collector produces readings for. StartUnixMilli
// and EndUnixMilli define the [start, end) filter on the meter table and are
// emitted verbatim on every Reading. IsCompleted is caller-declared: true for
// a sealed past day (is_completed=true at Zeus), false for the intra-day open
// window that the cron re-emits every tick.
type Window struct {
	StartUnixMilli int64
	EndUnixMilli   int64
	IsCompleted    bool
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
