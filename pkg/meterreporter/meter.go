package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/types/metrictypes"
)

// Meter is one registered meter — a name + how to produce readings for it. A meter is the single
// unit of extension: to add a new meter, append one Meter to the default registry (see registry.go).
//
// The same metric Name may appear multiple times in the registry as long as each entry
// uses a different SpaceAggregation (for example min/max/p99 of the same source meter).
type Meter struct {
	// Name is the meter's identifier.
	Name meterreportertypes.Name

	// Unit is reported verbatim as the signoz.billing.unit dimension.
	Unit string

	// RetentionDomain indicates which product TTL should be surfaced as the signoz.billing.retention.days dimension for this meter.
	RetentionDomain RetentionDomain

	// TimeAggregation reduces per-series samples across the query window.
	TimeAggregation metrictypes.TimeAggregation

	// SpaceAggregation reduces across series and is reported verbatim as the signoz.billing.aggregation dimension.
	SpaceAggregation metrictypes.SpaceAggregation

	// FilterExpression is an optional filter pushed into the query builder (e.g. "service.name = 'cart'").
	FilterExpression string

	// Collector knows how to turn this Meter into zero or more Readings per tick.
	Collector Collector
}
