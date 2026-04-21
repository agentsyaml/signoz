package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
)

// Exported names for every meter the reporter knows about. Refer to these
// symbols (not string literals) everywhere - typos turn into compile errors
// instead of silently producing a new meter row at Zeus.
var (
	MeterLogCount             = meterreportertypes.MustNewName("signoz.meter.log.count")
	MeterLogSize              = meterreportertypes.MustNewName("signoz.meter.log.size")
	MeterMetricDatapointCount = meterreportertypes.MustNewName("signoz.meter.metric.datapoint.count")
	MeterMetricDatapointSize  = meterreportertypes.MustNewName("signoz.meter.metric.datapoint.size")
)

const AggregationSum = "sum"

func baseMeters() []*Meter {
	meters := []*Meter{
		{
			Name:        MeterLogCount,
			Unit:        "count",
			Aggregation: AggregationSum,
			Collect:     CollectLogCountMeter,
		},
		{
			Name:        MeterLogSize,
			Unit:        "bytes",
			Aggregation: AggregationSum,
			Collect:     CollectLogSizeMeter,
		},
		{
			Name:        MeterMetricDatapointCount,
			Unit:        "count",
			Aggregation: AggregationSum,
			Collect:     CollectMetricDatapointCountMeter,
		},
		{
			Name:        MeterMetricDatapointSize,
			Unit:        "bytes",
			Aggregation: AggregationSum,
			Collect:     CollectMetricDatapointSizeMeter,
		},
	}

	mustValidateMeters(meters...)
	return meters
}

// DefaultMeters returns the hardcoded query-backed meters supported by the reporter.
func DefaultMeters() ([]Meter, error) {
	meters := baseMeters()
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
//   - have a non-empty Aggregation,
//   - have a non-nil Collect function,
//   - use a unique (Name, Aggregation) pair.
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
		if meter.Aggregation == "" {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "meter %q has no aggregation", meter.Name.String())
		}
		if meter.Collect == nil {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "meter %q has no collector function", meter.Name.String())
		}

		key := meter.Name.String() + "|" + meter.Aggregation
		if _, ok := seen[key]; ok {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidInput, "duplicate meter %q with aggregation %q", meter.Name.String(), meter.Aggregation)
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
