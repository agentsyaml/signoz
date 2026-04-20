package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/querier"
	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/types/metrictypes"
)

// Exported names for every meter the reporter knows about. Refer to these
// symbols (not string literals) everywhere - typos turn into compile errors
// instead of silently producing a new meter row at Zeus.
var (
	MeterLogCount = meterreportertypes.MustNewName("signoz.meter.log.count")
	MeterLogSize  = meterreportertypes.MustNewName("signoz.meter.log.size")
)

func baseMeters(q querier.Querier, sqlstore sqlstore.SQLStore) []*Meter {
	queryCollector := NewQueryCollector(q)
	retentionAwareQueryCollector := NewRetentionDimensionsCollector(queryCollector, NewSQLRetentionResolver(sqlstore))

	meters := []*Meter{
		{
			Name:             MeterLogCount,
			Unit:             "count",
			RetentionDomain:  RetentionDomainLogs,
			TimeAggregation:  metrictypes.TimeAggregationSum,
			SpaceAggregation: metrictypes.SpaceAggregationSum,
			Collector:        retentionAwareQueryCollector,
		},
		{
			Name:             MeterLogSize,
			Unit:             "bytes",
			RetentionDomain:  RetentionDomainLogs,
			TimeAggregation:  metrictypes.TimeAggregationSum,
			SpaceAggregation: metrictypes.SpaceAggregationSum,
			Collector:        retentionAwareQueryCollector,
		},
	}

	mustValidateMeters(meters...)
	return meters
}

// DefaultMeters returns the hardcoded query-backed meters supported by the reporter.
func DefaultMeters(q querier.Querier, sqlstore sqlstore.SQLStore) ([]Meter, error) {
	meters := baseMeters(q, sqlstore)
	if err := validateMeters(meters...); err != nil {
		return nil, err
	}

	resolved := make([]Meter, 0, len(meters))
	for _, meter := range meters {
		resolved = append(resolved, *meter)
	}

	return resolved, nil
}

// validateMeters checks that the runtime meter list is internally consistent.
// Every meter must:
//   - have a non-zero Name,
//   - have a non-empty Unit,
//   - have a non-nil Collector,
//   - use a unique (Name, SpaceAggregation) pair.
func validateMeters(meters ...*Meter) error {
	seen := make(map[string]struct{}, len(meters))

	for _, meter := range meters {
		if meter == nil {
			return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "nil meter in registry")
		}
		if meter.Name.IsZero() {
			return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meter with empty name in registry")
		}
		if meter.Unit == "" {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "meter %q has no unit", meter.Name.String())
		}
		if meter.Collector == nil {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "meter %q has no collector", meter.Name.String())
		}

		key := meter.Name.String() + "|" + meter.SpaceAggregation.StringValue()
		if _, ok := seen[key]; ok {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "duplicate meter %q with aggregation %q", meter.Name.String(), meter.SpaceAggregation.StringValue())
		}
		seen[key] = struct{}{}
	}

	return nil
}

// mustValidateMeters panics when hardcoded meter declarations are invalid.
func mustValidateMeters(meters ...*Meter) {
	if err := validateMeters(meters...); err != nil {
		panic(err)
	}
}
