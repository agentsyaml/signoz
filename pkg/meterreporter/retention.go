package meterreporter

import (
	"context"
	"database/sql"
	"strconv"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/telemetrylogs"
	"github.com/SigNoz/signoz/pkg/telemetrymetrics"
	"github.com/SigNoz/signoz/pkg/telemetrytraces"
	"github.com/SigNoz/signoz/pkg/types"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

type RetentionDomain string

const (
	RetentionDomainNone    RetentionDomain = ""
	RetentionDomainLogs    RetentionDomain = "logs"
	RetentionDomainMetrics RetentionDomain = "metrics"
	RetentionDomainTraces  RetentionDomain = "traces"
)

type retentionResolver interface {
	ResolveDays(ctx context.Context, orgID valuer.UUID, domain RetentionDomain) (string, bool, error)
}

type retentionDimensionsCollector struct {
	inner    Collector
	resolver retentionResolver
}

func NewRetentionDimensionsCollector(inner Collector, resolver retentionResolver) Collector {
	if inner == nil || resolver == nil {
		return inner
	}

	return &retentionDimensionsCollector{
		inner:    inner,
		resolver: resolver,
	}
}

func (c *retentionDimensionsCollector) Collect(ctx context.Context, meter Meter, orgID valuer.UUID, window Window) ([]meterreportertypes.Reading, error) {
	readings, err := c.inner.Collect(ctx, meter, orgID, window)
	if err != nil || len(readings) == 0 || meter.RetentionDomain == RetentionDomainNone {
		return readings, err
	}

	retentionDays, ok, err := c.resolver.ResolveDays(ctx, orgID, meter.RetentionDomain)
	if err != nil {
		return nil, err
	}
	if !ok {
		return readings, nil
	}

	for i := range readings {
		if readings[i].Dimensions == nil {
			readings[i].Dimensions = make(map[string]string, 1)
		}
		readings[i].Dimensions[DimensionRetentionDays] = retentionDays
	}

	return readings, nil
}

type sqlRetentionResolver struct {
	sqlstore sqlstore.SQLStore
}

func NewSQLRetentionResolver(sqlstore sqlstore.SQLStore) retentionResolver {
	if sqlstore == nil {
		return nil
	}

	return &sqlRetentionResolver{sqlstore: sqlstore}
}

func (r *sqlRetentionResolver) ResolveDays(ctx context.Context, orgID valuer.UUID, domain RetentionDomain) (string, bool, error) {
	tableName, ok := retentionTableName(domain)
	if !ok {
		return "", false, nil
	}

	ttl := new(types.TTLSetting)
	err := r.sqlstore.
		BunDB().
		NewSelect().
		Model(ttl).
		Where("table_name = ?", tableName).
		Where("org_id = ?", orgID.StringValue()).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", false, nil
		}
		return "", false, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "load retention for domain %q", domain)
	}

	if ttl.TTL <= 0 {
		return "", false, nil
	}

	return strconv.Itoa(ttl.TTL / (24 * 3600)), true, nil
}

func retentionTableName(domain RetentionDomain) (string, bool) {
	switch domain {
	case RetentionDomainLogs:
		return telemetrylogs.DBName + "." + telemetrylogs.LogsV2TableName, true
	case RetentionDomainMetrics:
		return telemetrymetrics.DBName + "." + telemetrymetrics.SamplesV4TableName, true
	case RetentionDomainTraces:
		return telemetrytraces.DBName + "." + telemetrytraces.SpanIndexV3TableName, true
	default:
		return "", false
	}
}
