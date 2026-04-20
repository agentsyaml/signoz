package signozmeterreporter

import (
	"github.com/SigNoz/signoz/pkg/errors"
	"go.opentelemetry.io/otel/metric"
)

type reporterMetrics struct {
	ticks           metric.Int64Counter
	readingsEmitted metric.Int64Counter
	collectErrors   metric.Int64Counter
	postErrors      metric.Int64Counter
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

	collectErrors, err := meter.Int64Counter("signoz.meterreporter.collect.errors", metric.WithDescription("Total number of collect errors across organizations and meters."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	postErrors, err := meter.Int64Counter("signoz.meterreporter.post.errors", metric.WithDescription("Total number of Zeus POST failures."))
	if err != nil {
		errs = errors.Join(errs, err)
	}

	if errs != nil {
		return nil, errs
	}

	return &reporterMetrics{
		ticks:           ticks,
		readingsEmitted: readingsEmitted,
		collectErrors:   collectErrors,
		postErrors:      postErrors,
	}, nil
}
