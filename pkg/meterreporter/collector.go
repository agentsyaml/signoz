package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/telemetrystore"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// Window is the reporting window a Collector produces readings for. Timestamps
// are unix milliseconds; StartMs is used as the emitted reading's Timestamp
// and typically aligns to UTC day start.
type Window struct {
	StartMs int64
	EndMs   int64
}

// CollectorDeps contains the dependencies a meter collector may need to
// resolve readings. Individual collectors can choose the subset they use.
type CollectorDeps struct {
	TelemetryStore telemetrystore.TelemetryStore
	SQLStore       sqlstore.SQLStore
}

// CollectorFunc resolves readings for a single Meter.
type CollectorFunc func(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error)
