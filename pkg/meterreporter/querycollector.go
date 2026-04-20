package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/querier"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/SigNoz/signoz/pkg/types/telemetrytypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

var _ Collector = (*QueryCollector)(nil)

// QueryCollector produces a single scalar Reading per Collect call by issuing a RequestTypeScalar query
// against the querier over SourceMeter. It reads everything it needs from the Meter it is invoked with.
type QueryCollector struct {
	querier querier.Querier
}

func NewQueryCollector(q querier.Querier) *QueryCollector {
	return &QueryCollector{querier: q}
}

func (c *QueryCollector) Collect(ctx context.Context, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	req := buildQueryRequest(meter, window.StartMs, window.EndMs)

	resp, err := c.querier.QueryRange(ctx, orgID, req)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query range for meter %q", meter.Name.String())
	}

	value, ok := extractScalarValue(resp)
	if !ok {
		return nil, nil
	}

	return []meterreportertypes.Reading{{
		MeterName:   meter.Name.String(),
		Value:       value,
		Timestamp:   window.BucketStartMs,
		IsCompleted: false,
		Dimensions: map[string]string{
			DimensionAggregation: meter.SpaceAggregation.StringValue(),
			DimensionUnit:        meter.Unit,
		},
	}}, nil
}

// buildQueryRequest composes a single-query, single-aggregation scalar request over the meter source.
// The querier applies its own step interval defaults for SourceMeter.
func buildQueryRequest(meter Meter, startMs, endMs uint64) *querybuildertypesv5.QueryRangeRequest {
	builderQuery := querybuildertypesv5.QueryBuilderQuery[querybuildertypesv5.MetricAggregation]{
		Name:   "A",
		Signal: telemetrytypes.SignalMetrics,
		Source: telemetrytypes.SourceMeter,
		Aggregations: []querybuildertypesv5.MetricAggregation{{
			MetricName:       meter.Name.String(),
			TimeAggregation:  meter.TimeAggregation,
			SpaceAggregation: meter.SpaceAggregation,
		}},
	}

	if meter.FilterExpression != "" {
		builderQuery.Filter = &querybuildertypesv5.Filter{Expression: meter.FilterExpression}
	}

	return &querybuildertypesv5.QueryRangeRequest{
		Start:       startMs,
		End:         endMs,
		RequestType: querybuildertypesv5.RequestTypeScalar,
		CompositeQuery: querybuildertypesv5.CompositeQuery{
			Queries: []querybuildertypesv5.QueryEnvelope{
				{
					Type: querybuildertypesv5.QueryTypeBuilder,
					Spec: builderQuery,
				},
			},
		},
		NoCache: true,
	}
}

// extractScalarValue pulls the single scalar value out of a ScalarData result.
// Returns (value, true) for a well-formed single-row/single-aggregation
// result, (0, false) otherwise (empty, multi-row, non-scalar).
func extractScalarValue(resp *querybuildertypesv5.QueryRangeResponse) (float64, bool) {
	if resp == nil || len(resp.Data.Results) == 0 {
		return 0, false
	}

	scalar, ok := resp.Data.Results[0].(*querybuildertypesv5.ScalarData)
	if !ok {
		if direct, ok := resp.Data.Results[0].(querybuildertypesv5.ScalarData); ok {
			scalar = &direct
		} else {
			return 0, false
		}
	}

	if len(scalar.Data) == 0 || len(scalar.Data[0]) == 0 {
		return 0, false
	}

	for colIdx, col := range scalar.Columns {
		if col == nil {
			continue
		}
		if col.Type == querybuildertypesv5.ColumnTypeAggregation {
			if colIdx >= len(scalar.Data[0]) {
				return 0, false
			}
			switch v := scalar.Data[0][colIdx].(type) {
			case float64:
				return v, true
			case float32:
				return float64(v), true
			case int:
				return float64(v), true
			case int64:
				return float64(v), true
			case uint64:
				return float64(v), true
			}
			return 0, false
		}
	}

	return 0, false
}
