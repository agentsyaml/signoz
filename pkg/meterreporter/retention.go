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

// Fallback retention (in days) used when an org has no ttl_setting row. These
// must mirror the DDL TTL on each domain's main ClickHouse table — any mismatch
// means we'll bill customers for a retention they aren't actually getting.
//
//	logs    → signoz_logs.logs_v2           15d
//	metrics → signoz_metrics.samples_v4     30d  (2_592_000s in the DDL)
//	traces  → signoz_traces.signoz_index_v3 15d  (1_296_000s in the DDL)
var defaultRetentionDaysByDomain = map[RetentionDomain]int{
	RetentionDomainLogs:    types.DefaultRetentionDays,
	RetentionDomainMetrics: 30,
	RetentionDomainTraces:  15,
}

// resolveRetentionDays returns the per-org retention for a domain, ready to
// stamp on a Reading as DimensionRetentionDays.
//
// Source of truth is the ttl_setting row written by the V2 retention path,
// keyed on (org_id, local_table_name) and storing the value in days. When no
// row exists — or the stored value is non-positive — we fall back to the DDL
// default so the reading always ships with an accurate dimension.
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

	return strconv.Itoa(ttl.TTL), true, nil
}

// domainFallbackRetention is the fallback branch for resolveRetentionDays.
// An unknown domain is a programming error — callers only ever pass the
// exported RetentionDomain* constants.
func domainFallbackRetention(domain RetentionDomain) (string, bool, error) {
	days, ok := defaultRetentionDaysByDomain[domain]
	if !ok {
		return "", false, errors.Newf(errors.TypeInternal, ErrCodeReportFailed, "no default retention defined for domain %q", domain)
	}
	return strconv.Itoa(days), true, nil
}

// retentionTableName returns the local (non-distributed) ClickHouse table name
// used as the ttl_setting key for each domain. This must match exactly what
// SetCustomRetentionV2 writes — if the V2 writer ever changes the key, update
// this switch in the same change.
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
