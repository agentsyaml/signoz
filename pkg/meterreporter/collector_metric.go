package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/telemetrymeter"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
	"github.com/huandu/go-sqlbuilder"
)

// Collectors in this file are intentionally duplicated per meter. Do not fold
// them into a shared helper — these are billing-critical paths, and keeping
// each query isolated means a bug in one cannot silently corrupt every
// customer's bill across every meter.

// CollectMetricDatapointCountMeter sums every signoz.meter.metric.datapoint.count
// sample in the window and emits one Reading for the org.
func CollectMetricDatapointCountMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterMetricDatapointCount.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterMetricDatapointCount.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainMetrics)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterMetricDatapointCount.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}

// CollectMetricDatapointSizeMeter sums every signoz.meter.metric.datapoint.size
// sample in the window and emits one Reading for the org.
func CollectMetricDatapointSizeMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterMetricDatapointSize.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterMetricDatapointSize.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainMetrics)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterMetricDatapointSize.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}
