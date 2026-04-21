package meterreporter

import (
	"context"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/telemetrymeter"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
	"github.com/huandu/go-sqlbuilder"
)

// CollectLogCountMeter emits a single Reading for signoz.meter.log.count.
// Each log-meter collector owns its own query end-to-end — duplication is
// preferred over shared helpers because these paths are billing-critical.
func CollectLogCountMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterLogCount.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterLogCount.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainLogs)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterLogCount.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}

// CollectLogSizeMeter emits a single Reading for signoz.meter.log.size.
// Each log-meter collector owns its own query end-to-end — duplication is
// preferred over shared helpers because these paths are billing-critical.
func CollectLogSizeMeter(ctx context.Context, deps CollectorDeps, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	if deps.TelemetryStore == nil {
		return nil, errors.New(errors.TypeInternal, ErrCodeReportFailed, "telemetry store is nil")
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("ifNull(sum(value), 0) AS value")
	sb.From(telemetrymeter.DBName + "." + telemetrymeter.SamplesTableName)
	sb.Where(
		sb.Equal("metric_name", MeterLogSize.String()),
		sb.GTE("unix_milli", window.StartMs),
		sb.LT("unix_milli", window.EndMs),
	)
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)

	var value float64
	if err := deps.TelemetryStore.ClickhouseDB().QueryRow(ctx, query, args...).Scan(&value); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "query meter %q", MeterLogSize.String())
	}

	dimensions := map[string]string{
		DimensionAggregation:    meter.Aggregation,
		DimensionUnit:           meter.Unit,
		DimensionOrganizationID: orgID.StringValue(),
	}

	retentionDays, ok, err := resolveRetentionDays(ctx, deps.SQLStore, orgID, RetentionDomainLogs)
	if err != nil {
		return nil, err
	}
	if ok {
		dimensions[DimensionRetentionDays] = retentionDays
	}

	return []meterreportertypes.Reading{{
		MeterName:   MeterLogSize.String(),
		Value:       value,
		Timestamp:   window.StartMs,
		IsCompleted: false,
		Dimensions:  dimensions,
	}}, nil
}
