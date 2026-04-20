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

// tick collects one round of readings across orgs × collectors and ships them to zeus
// per-org / per-collector errors are logged and counted but do not abort the tick - sibling orgs still report.
func (provider *Provider) tick(ctx context.Context) error {
	now := time.Now().UTC()

	// Go to 00:00 UTC of current day (in milliseconds)
	bucketStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	// Period in which meter data will be queried: 00:00 UTC → now UTC
	window := meterreporter.Window{
		StartMs:       uint64(bucketStart.UnixMilli()),
		EndMs:         uint64(now.UnixMilli()),
		BucketStartMs: bucketStart.UnixMilli(),
	}

	// Collect all the orgs handled by this SigNoz instance
	orgs, err := provider.orgGetter.ListByOwnedKeyRange(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "failed to list organizations")
	}

	readingsByLicenseKey := make(map[string][]meterreportertypes.Reading)

	for _, org := range orgs {
		license, err := provider.licensing.GetActive(ctx, org.ID)
		if err != nil {
			provider.settings.Logger().WarnContext(ctx, "skipping org, failed to fetch active license", errors.Attr(err), slog.String("org_id", org.ID.StringValue()))
			continue
		}
		if license == nil || license.Key == "" {
			provider.settings.Logger().WarnContext(ctx, "skipping org, nil/empty license for org", slog.String("org_id", org.ID.StringValue()))
			continue
		}

		orgReadings := provider.collectOrgReadings(ctx, org.ID, window)
		if len(orgReadings) == 0 {
			continue
		}

		readingsByLicenseKey[license.Key] = append(readingsByLicenseKey[license.Key], orgReadings...)
	}

	if len(readingsByLicenseKey) == 0 {
		return nil
	}

	date := bucketStart.Format("2006-01-02")
	for licenseKey, readings := range readingsByLicenseKey {
		if err := provider.shipReadings(ctx, licenseKey, date, readings); err != nil {
			provider.metrics.postErrors.Add(ctx, 1)
			provider.settings.Logger().ErrorContext(ctx, "failed to ship meter readings", errors.Attr(err), slog.Int("readings", len(readings)))
			continue
		}
		provider.metrics.readingsEmitted.Add(ctx, int64(len(readings)))
	}

	return nil
}

// collectOrgReadings runs every registered Meter's Collector against orgID and
// returns their combined Readings with DimensionOrganizationID attached.
// Individual meter failures are logged and skipped — one bad meter does not
// block the rest of the batch.
func (provider *Provider) collectOrgReadings(ctx context.Context, orgID valuer.UUID, window meterreporter.Window) []meterreportertypes.Reading {
	readings := make([]meterreportertypes.Reading, 0, len(provider.meters))

	for _, meter := range provider.meters {
		collectedReadings, err := meter.Collector.Collect(ctx, meter, orgID, window)
		if err != nil {
			provider.metrics.collectErrors.Add(ctx, 1)
			provider.settings.Logger().WarnContext(ctx, "meter collection failed", errors.Attr(err), slog.String("meter", meter.Name.String()), slog.String("org_id", orgID.StringValue()))
			continue
		}

		for i := range collectedReadings {
			if collectedReadings[i].Dimensions == nil {
				collectedReadings[i].Dimensions = make(map[string]string, 1)
			}
			collectedReadings[i].Dimensions[meterreporter.DimensionOrganizationID] = orgID.StringValue()
		}

		readings = append(readings, collectedReadings...)
	}

	// ! (balanikaran): TEMP for debugging
	provider.settings.Logger().InfoContext(ctx, "final readings", slog.Any("readings", readings))

	return readings
}

// shipReadings encodes the batch as PostableMeterReadings JSON and POSTs it to
// Zeus in a single request. The date-scoped idempotency key lets Zeus UPSERT
// on subsequent ticks within the same UTC day.
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

	if err := provider.zeus.PutMeterReadings(ctx, licenseKey, idempotencyKey, body); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, meterreporter.ErrCodeReportFailed, "zeus put meter readings")
	}

	return nil
}
