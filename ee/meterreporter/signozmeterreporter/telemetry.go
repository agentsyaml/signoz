package signozmeterreporter

import (
	"github.com/SigNoz/signoz/pkg/errors"
	"go.opentelemetry.io/otel/metric"
)

type reporterMetrics struct {
	ticks                metric.Int64Counter
	readingsEmitted      metric.Int64Counter
	collectErrors        metric.Int64Counter
	postErrors           metric.Int64Counter
	latestSealedErrors   metric.Int64Counter
	catchupDaysProcessed metric.Int64Counter
	collectDuration      metric.Float64Histogram
	shipDuration         metric.Float64Histogram
}

func newReporterMetrics(meter metric.Meter) (*reporterMetrics, error) {
	var errs error

	ticks, err := meter.Int64Counter("signoz.meterreporter.ticks", metric.WithDescription("Total number of meter reporter ticks that ran to completion or aborted."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	readingsEmitted, err := meter.Int64Counter("signoz.meterreporter.readings.emitted", metric.WithDescription("Total number of meter readings shipped to Zeus."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	collectErrors, err := meter.Int64Counter("signoz.meterreporter.collect.errors", metric.WithDescription("Total number of collect errors across organizations and meters, tagged with phase={sealed|today}."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	postErrors, err := meter.Int64Counter("signoz.meterreporter.post.errors", metric.WithDescription("Total number of Zeus POST failures, tagged with phase={sealed|today}."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	latestSealedErrors, err := meter.Int64Counter("signoz.meterreporter.latestsealed.errors", metric.WithDescription("Total number of ticks skipped because the Zeus LatestSealed call failed."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	catchupDaysProcessed, err := meter.Int64Counter("signoz.meterreporter.catchup.days_processed", metric.WithDescription("Total number of sealed (is_completed=true) days the catch-up loop attempted to ship, tagged with result={success|failure}."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	collectDuration, err := meter.Float64Histogram("signoz.meterreporter.collect.duration", metric.WithDescription("Time taken to collect readings from all registered meters in a single phase of a tick, tagged with phase={sealed|today}."), metric.WithUnit("s"))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	shipDuration, err := meter.Float64Histogram("signoz.meterreporter.ship.duration", metric.WithDescription("Time taken to ship (marshal + POST) collected readings to Zeus in a single phase of a tick, tagged with phase={sealed|today}."), metric.WithUnit("s"))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	if errs != nil {
		return nil, errs
	}

	return &reporterMetrics{
		ticks:                ticks,
		readingsEmitted:      readingsEmitted,
		collectErrors:        collectErrors,
		postErrors:           postErrors,
		latestSealedErrors:   latestSealedErrors,
		catchupDaysProcessed: catchupDaysProcessed,
		collectDuration:      collectDuration,
		shipDuration:         shipDuration,
	}, nil
}
