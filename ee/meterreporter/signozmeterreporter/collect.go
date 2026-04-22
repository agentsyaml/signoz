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
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	phaseSealed = "sealed"
	phaseToday  = "today"

	attrPhase  = "phase"
	attrResult = "result"

	resultSuccess = "success"
	resultFailure = "failure"
)

// tick runs one collect-and-ship cycle for the instance's active org. The
// tick first checkpoints against Zeus via LatestSealed; if that fails the
// whole tick is skipped so the two concerns can't run against an inconsistent
// view of Zeus state. The underlying http client already retries transient
// failures 3× with a 2s constant backoff (see pkg/http/client), so no extra
// retry loop is needed here. On success the tick runs two concerns:
//
//	(A) sealed-range processor — forward-fills is_completed=true days from
//	    the Zeus-reported catchup start up to yesterday, capped at
//	    Config.CatchupMaxDaysPerTick. On any per-day ship failure the loop
//	    breaks; next tick's LatestSealed returns the same catchup start so
//	    the failed day is retried cleanly with no local state to reconcile.
//
//	(B) today partial — re-emits the intra-day [00:00 UTC, now) window every
//	    tick as is_completed=false; the day-scoped X-Idempotency-Key makes
//	    successive writes UPSERT at Zeus.
//
// Per-collector and ship failures are logged and counted — they do not abort
// the tick or propagate, because the reporter must keep ticking on the next interval.
func (provider *Provider) tick(ctx context.Context) error {
	now := time.Now().UTC()
	// Align to 00:00 UTC of the current day. All window boundaries are derived
	// from this single snapshot so a tick can't straddle midnight inconsistently.
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	yesterday := todayStart.AddDate(0, 0, -1)

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

	// Checkpoint against Zeus. A nil return means "no sealed rows yet for this
	// license" → bootstrap catch-up starts from today - HistoricalBackfillDays.
	// Any error aborts the whole tick so concern B doesn't flow without a
	// consistent view of the sealed catchup start; the http client already
	// retried transient failures before reaching this point.
	latest, err := provider.zeus.LatestSealed(ctx, license.Key)
	if err != nil {
		provider.metrics.latestSealedErrors.Add(ctx, 1)
		provider.settings.Logger().ErrorContext(ctx, "skipping tick: latest-sealed call failed", errors.Attr(err))
		return nil
	}

	// Concern A — sealed-range processor.
	var catchupStart time.Time
	if latest == nil {
		catchupStart = todayStart.AddDate(0, 0, -meterreporter.HistoricalBackfillDays)
	} else {
		catchupStart = latest.AddDate(0, 0, 1)
	}
	if !catchupStart.After(yesterday) {
		end := catchupStart.AddDate(0, 0, provider.config.CatchupMaxDaysPerTick-1)
		if end.After(yesterday) {
			end = yesterday
		}
		for day := catchupStart; !day.After(end); day = day.AddDate(0, 0, 1) {
			window := meterreporter.Window{
				StartUnixMilli: day.UnixMilli(),
				EndUnixMilli:   day.AddDate(0, 0, 1).UnixMilli(),
				IsCompleted:    true,
			}
			date := day.Format("2006-01-02")
			err := provider.runPhase(ctx, org.ID, license.Key, window, date, phaseSealed)
			result := resultSuccess
			if err != nil {
				result = resultFailure
			}
			provider.metrics.catchupDaysProcessed.Add(ctx, 1, metric.WithAttributes(attribute.String(attrResult, result)))
			if err != nil {
				break
			}
		}
	}

	// Concern B — today partial. Runs every tick regardless of concern A's
	// progress; concern A's failures break their own loop but never block the
	// partial.
	todayWindow := meterreporter.Window{
		StartUnixMilli: todayStart.UnixMilli(),
		EndUnixMilli:   now.UnixMilli(),
		IsCompleted:    false,
	}
	_ = provider.runPhase(ctx, org.ID, license.Key, todayWindow, todayStart.Format("2006-01-02"), phaseToday)

	return nil
}

// runPhase is the shared collect+ship body for one (window, idempotency-date)
// pair. phaseLabel is informational — logs only; the wire format carries
// IsCompleted via window. Returns err only on ship failure so the sealed-range
// loop can break on first failure; collect-level failures are logged and
// counted per-meter inside collectOrgReadings and never bubble up here.
func (provider *Provider) runPhase(ctx context.Context, orgID valuer.UUID, licenseKey string, window meterreporter.Window, date string, phaseLabel string) error {
	phaseAttr := metric.WithAttributes(attribute.String(attrPhase, phaseLabel))

	collectStart := time.Now()
	readings := provider.collectOrgReadings(ctx, orgID, window, phaseLabel)
	provider.metrics.collectDuration.Record(ctx, time.Since(collectStart).Seconds(), phaseAttr)
	if len(readings) == 0 {
		return nil
	}

	shipStart := time.Now()
	err := provider.shipReadings(ctx, licenseKey, date, readings)
	provider.metrics.shipDuration.Record(ctx, time.Since(shipStart).Seconds(), phaseAttr)
	if err != nil {
		provider.metrics.postErrors.Add(ctx, 1, phaseAttr)
		provider.settings.Logger().ErrorContext(ctx, "failed to ship meter readings",
			errors.Attr(err),
			slog.String("phase", phaseLabel),
			slog.String("date", date),
			slog.Int("readings", len(readings)),
		)
		return err
	}
	provider.metrics.readingsEmitted.Add(ctx, int64(len(readings)), phaseAttr)
	return nil
}

// collectOrgReadings runs every registered Meter's Collector against orgID and
// returns the combined Readings. One bad meter must not block the batch, so
// per-meter failures are logged and counted via collectErrors and then skipped
// — the remaining meters still ship. phaseLabel tags the error counter so
// sealed-day collect failures can be separated from today-partial failures.
func (provider *Provider) collectOrgReadings(ctx context.Context, orgID valuer.UUID, window meterreporter.Window, phaseLabel string) []meterreportertypes.Reading {
	readings := make([]meterreportertypes.Reading, 0, len(provider.meters))
	phaseAttr := metric.WithAttributes(attribute.String(attrPhase, phaseLabel))

	for _, meter := range provider.meters {
		collectedReadings, err := meter.Collect(ctx, provider.deps, meter, orgID, window)
		if err != nil {
			provider.metrics.collectErrors.Add(ctx, 1, phaseAttr)
			provider.settings.Logger().WarnContext(ctx, "meter collection failed",
				errors.Attr(err),
				slog.String("meter", meter.Name.String()),
				slog.String("org_id", orgID.StringValue()),
				slog.String("phase", phaseLabel),
			)
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
