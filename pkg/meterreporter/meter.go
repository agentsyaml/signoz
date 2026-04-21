package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
)

// Meter is one registered meter - a name, billing metadata, and the function that knows how to produce readings for it.
//
// The same metric Name may appear multiple times in the registry as long as each entry
// uses a different Aggregation (for example min/max/p99 of the same source meter).
type Meter struct {
	// Name is the meter's identifier.
	Name meterreportertypes.Name

	// Unit is available to the collector for the signoz.billing.unit dimension.
	Unit string

	// Aggregation is available to the collector for the signoz.billing.aggregation dimension.
	Aggregation string

	// Collect knows how to turn this Meter into zero or more Readings per tick.
	Collect CollectorFunc
}
