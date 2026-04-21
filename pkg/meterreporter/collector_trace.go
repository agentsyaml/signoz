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

// CollectSpanCountMeter sums every signoz.meter.span.count sample in the window
// and emits one Reading for the org.
func CollectSpanCountMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterSpanCount.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterSpanCount.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainTraces)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterSpanCount.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}

// CollectSpanSizeMeter sums every signoz.meter.span.size sample in the window
// and emits one Reading for the org.
func CollectSpanSizeMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterSpanSize.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterSpanSize.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainTraces)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterSpanSize.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}
