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
	"github.com/SigNoz/signoz/pkg/valuer"
)

type RetentionDomain string

const (
	RetentionDomainLogs    RetentionDomain = "logs"
	RetentionDomainMetrics RetentionDomain = "metrics"
	RetentionDomainTraces  RetentionDomain = "traces"
)

// defaultRetentionDaysByDomain is the per-domain fallback used when no
// ttl_setting row exists for the org. Values mirror the TTL set by the
// canonical ClickHouse schema for each domain's main table:
//
//   - logs:    signoz_logs.logs_v2            → 15 days
//   - metrics: signoz_metrics.samples_v4      → 2 592 000 s  = 30 days
//   - traces:  signoz_traces.signoz_index_v3  → 1 296 000 s  = 15 days
//
// If a migration ever changes the DDL default for a domain, update the
// corresponding entry here so billing readings match reality.
var defaultRetentionDaysByDomain = map[RetentionDomain]int{
	RetentionDomainLogs:    types.DefaultRetentionDays,
	RetentionDomainMetrics: 30,
	RetentionDomainTraces:  15,
}

// resolveRetentionDays returns the configured retention for orgID in the given
// domain as a string suitable for the DimensionRetentionDays dimension.
//
// It queries the ttl_setting table using the local (non-distributed) table
// name, which is what the V2 retention writer uses. The TTL column is stored
// in days by the V2 path. When no row exists or the stored TTL is non-positive,
// defaultRetentionDaysByDomain provides the per-domain ClickHouse default so
// the reading always carries an accurate retention dimension.
func resolveRetentionDays(ctx context.Context, sqlstore sqlstore.SQLStore, orgID valuer.UUID, domain RetentionDomain) (string, bool, error) {
	if sqlstore == nil {
		return "", false, nil
	}
	tableName, ok := retentionTableName(domain)
	if !ok {
		return "", false, nil
	}

	ttl := new(types.TTLSetting)
	err := sqlstore.
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
			return domainFallbackRetention(domain)
		}
		return "", false, errors.Wrapf(err, errors.TypeInternal, ErrCodeReportFailed, "load retention for domain %q", domain)
	}

	if ttl.TTL <= 0 {
		return domainFallbackRetention(domain)
	}

	// TTL is stored in days by the V2 retention path (SetCustomRetentionV2).
	return strconv.Itoa(ttl.TTL), true, nil
}

// domainFallbackRetention returns the per-domain default retention used when
// no ttl_setting row exists for an org.
func domainFallbackRetention(domain RetentionDomain) (string, bool, error) {
	days, ok := defaultRetentionDaysByDomain[domain]
	if !ok {
		return "", false, errors.Newf(errors.TypeInternal, ErrCodeReportFailed, "no default retention defined for domain %q", domain)
	}
	return strconv.Itoa(days), true, nil
}

// retentionTableName returns the local ClickHouse table name used as the key
// in ttl_setting rows for each domain. Must match what SetCustomRetentionV2
// writes (the local, not distributed, table name).
func retentionTableName(domain RetentionDomain) (string, bool) {
	switch domain {
	case RetentionDomainLogs:
		return telemetrylogs.DBName + "." + telemetrylogs.LogsV2LocalTableName, true
	case RetentionDomainMetrics:
		return telemetrymetrics.DBName + "." + telemetrymetrics.SamplesV4LocalTableName, true
	case RetentionDomainTraces:
		return telemetrytraces.DBName + "." + telemetrytraces.SpanIndexV3LocalTableName, true
	default:
		return "", false
	}
}
