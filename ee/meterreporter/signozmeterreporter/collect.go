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

// tick collects one round of readings for the instance's org and ships them to
// zeus under its active license. Per-collector errors are logged and counted
// but do not abort the tick.
func (provider *Provider) tick(ctx context.Context) error {
	now := time.Now().UTC()

	// Go to 00:00 UTC of current day (in milliseconds)
	bucketStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	// Period in which meter data will be queried: 00:00 UTC → now UTC
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
		// Billing is scoped to a single license per instance; the meter data in signoz_meter has no org marker,
		// so we can't split a multi-org instance correctly. Report against the first org and warn.
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

	readings := provider.collectOrgReadings(ctx, org.ID, window)
	if len(readings) == 0 {
		return nil
	}

	date := bucketStart.Format("2006-01-02")
	if err := provider.shipReadings(ctx, license.Key, date, readings); err != nil {
		provider.metrics.postErrors.Add(ctx, 1)
		provider.settings.Logger().ErrorContext(ctx, "failed to ship meter readings", errors.Attr(err), slog.Int("readings", len(readings)))
		return nil
	}
	provider.metrics.readingsEmitted.Add(ctx, int64(len(readings)))

	return nil
}

// collectOrgReadings runs every registered Meter's Collector against orgID and
// returns their combined Readings. Individual meter failures are logged and
// skipped — one bad meter does not block the rest of the batch.
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

// shipReadings encodes the batch as PostableMeterReadings JSON and, in the
// fully wired flow, POSTs it to Zeus under a date-scoped idempotency key so
// subsequent ticks within the same UTC day UPSERT.
//
// ! TEMPORARY: the Zeus PutMeterReadings endpoint is not live yet. Until it
// lands, we log the payload at INFO so staging can verify collection end-to-end
// without a server counterpart. Restore the Zeus call (and drop the log) once
// the API ships.
func (provider *Provider) shipReadings(ctx context.Context, licenseKey string, date string, readings []meterreportertypes.Reading) error {
	idempotencyKey := fmt.Sprintf("meter-cron:%s", date)

	// ! TODO: this needs to be fixed in the format we make the zeus API
	payload := meterreportertypes.PostableMeterReadings{
		IdempotencyKey: idempotencyKey,
		Readings:       readings,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "marshal meter readings")
	}

	// ! TEMPORARY: skip the Zeus call until the API is available. Logging the
	// serialized payload instead so we can eyeball readings in staging logs.
	// When Zeus is ready, replace the log below with:
	//   if err := provider.zeus.PutMeterReadings(ctx, licenseKey, idempotencyKey, body); err != nil { ... }
	provider.settings.Logger().InfoContext(ctx, "meter readings (Zeus API not yet live — dry-run log)",
		slog.String("license_key", licenseKey),
		slog.String("idempotency_key", idempotencyKey),
		slog.Int("readings", len(readings)),
		slog.String("payload", string(body)),
	)
	_ = provider.zeus // keep the field referenced so the dep wiring does not bitrot

	return nil
}
