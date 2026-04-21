package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
)

// Meter is a single registered billing meter — a name, its billing metadata,
// and the function that produces Readings for it.
//
// The same Name may appear multiple times in the registry provided each entry
// uses a different Aggregation (e.g. a sum and a p99 of the same source meter).
// The (Name, Aggregation) pair is what Zeus keys on.
type Meter struct {
	// Name is the billing identifier emitted on every Reading.
	Name meterreportertypes.Name

	// Unit is copied onto DimensionUnit by the collector.
	Unit string

	// Aggregation is copied onto DimensionAggregation and participates in the
	// uniqueness check in validateMeters.
	Aggregation string

	// Collect turns this Meter into zero or more Readings per tick.
	Collect CollectorFunc
}
