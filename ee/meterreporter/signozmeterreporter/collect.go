package signozmeterreporter

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/meterreporter"
	"github.com/SigNoz/signoz/pkg/types/meterreportertypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// tick runs one collect-and-ship cycle for the instance's active org. Every
// tick queries the same UTC-day window (00:00 → now), so repeat ticks within
// the day UPSERT at Zeus via the date-scoped idempotency key. Per-collector
// and ship failures are logged and counted — they do not abort the tick or
// propagate, because the reporter must keep ticking on the next interval.
func (provider *Provider) tick(ctx context.Context) error {
	now := time.Now().UTC()
	// Align to 00:00 UTC of the current day. Reading.Timestamp inherits this,
	// so every sample within the day maps to the same billing bucket.
	bucketStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	window := meterreporter.Window{
		StartMs: bucketStart.UnixMilli(),
		EndMs:   now.UnixMilli(),
	}

	orgs, err := provider.orgGetter.ListByOwnedKeyRange(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "failed to list organizations")
	}
	if len(orgs) == 0 {
		return nil
	}
	if len(orgs) > 1 {
		// Billing is scoped to a single license per instance, and the meter data
		// in signoz_meter carries no org marker — we can't attribute samples to
		// one org versus another. Report against the first org and warn so the
		// mis-configuration is visible in logs.
		provider.settings.Logger().WarnContext(ctx, "multiple orgs on a single instance; reporting only the first", slog.Int("org_count", len(orgs)))
	}
	org := orgs[0]

	license, err := provider.licensing.GetActive(ctx, org.ID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "failed to fetch active license for org %q", org.ID.StringValue())
	}
	if license == nil || license.Key == "" {
		provider.settings.Logger().WarnContext(ctx, "skipping tick, nil/empty license for org", slog.String("org_id", org.ID.StringValue()))
		return nil
	}

	collectStart := time.Now()
	readings := provider.collectOrgReadings(ctx, org.ID, window)
	provider.metrics.collectDuration.Record(ctx, time.Since(collectStart).Seconds())
	if len(readings) == 0 {
		return nil
	}

	date := bucketStart.Format("2006-01-02")
	shipStart := time.Now()
	err = provider.shipReadings(ctx, license.Key, date, readings)
	provider.metrics.shipDuration.Record(ctx, time.Since(shipStart).Seconds())
	if err != nil {
		provider.metrics.postErrors.Add(ctx, 1)
		provider.settings.Logger().ErrorContext(ctx, "failed to ship meter readings", errors.Attr(err), slog.Int("readings", len(readings)))
		return nil
	}
	provider.metrics.readingsEmitted.Add(ctx, int64(len(readings)))

	return nil
}

// collectOrgReadings runs every registered Meter's Collector against orgID and
// returns the combined Readings. One bad meter must not block the batch, so
// per-meter failures are logged and counted via collectErrors and then skipped
// — the remaining meters still ship.
func (provider *Provider) collectOrgReadings(ctx context.Context, orgID valuer.UUID, window meterreporter.Window) []meterreportertypes.Reading {
	readings := make([]meterreportertypes.Reading, 0, len(provider.meters))

	for _, meter := range provider.meters {
		collectedReadings, err := meter.Collect(ctx, provider.deps, meter, orgID, window)
		if err != nil {
			provider.metrics.collectErrors.Add(ctx, 1)
			provider.settings.Logger().WarnContext(ctx, "meter collection failed", errors.Attr(err), slog.String("meter", meter.Name.String()), slog.String("org_id", orgID.StringValue()))
			continue
		}

		readings = append(readings, collectedReadings...)
	}

	return readings
}

// shipReadings serializes the batch as PostableMeterReadings and, in the fully
// wired flow, POSTs it to Zeus under a date-scoped idempotency key so repeat
// ticks within the same UTC day UPSERT instead of duplicating usage.
//
// ! TEMPORARY: the Zeus PutMeterReadings endpoint isn't live yet. Until it
// ships we log the serialized payload at INFO instead, which lets staging
// verify collection end-to-end without a server counterpart. Once the API
// lands, drop the log block and restore:
//
//	if err := provider.zeus.PutMeterReadings(ctx, licenseKey, idempotencyKey, body); err != nil { ... }
func (provider *Provider) shipReadings(ctx context.Context, licenseKey string, date string, readings []meterreportertypes.Reading) error {
	idempotencyKey := fmt.Sprintf("meter-cron:%s", date)

	// ! TODO: confirm this payload shape once the Zeus API is finalized.
	payload := meterreportertypes.PostableMeterReadings{
		IdempotencyKey: idempotencyKey,
		Readings:       readings,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "marshal meter readings")
	}

	provider.settings.Logger().InfoContext(ctx, "meter readings (Zeus API not yet live — dry-run log)",
		slog.String("license_key", licenseKey),
		slog.String("idempotency_key", idempotencyKey),
		slog.Int("readings", len(readings)),
		slog.String("payload", string(body)),
	)
	// Keep the zeus dep referenced so the factory signature and DI wiring don't
	// bitrot while the POST is stubbed out.
	_ = provider.zeus

	return nil
}
