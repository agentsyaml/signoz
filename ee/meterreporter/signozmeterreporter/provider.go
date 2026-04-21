package signozmeterreporter

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/factory"
	"github.com/SigNoz/signoz/pkg/licensing"
	"github.com/SigNoz/signoz/pkg/meterreporter"
	"github.com/SigNoz/signoz/pkg/modules/organization"
	"github.com/SigNoz/signoz/pkg/sqlstore"
	"github.com/SigNoz/signoz/pkg/telemetrystore"
	"github.com/SigNoz/signoz/pkg/zeus"
)

var _ factory.ServiceWithHealthy = (*Provider)(nil)

// Provider is the enterprise meter reporter. It ticks on a fixed interval,
// invokes every registered Collector against every licensed org, and ships
// the resulting readings to Zeus.
type Provider struct {
	settings factory.ScopedProviderSettings
	config   meterreporter.Config
	meters   []meterreporter.Meter
	deps     meterreporter.CollectorDeps

	licensing licensing.Licensing
	orgGetter organization.Getter
	zeus      zeus.Zeus

	healthyC     chan struct{}
	stopC        chan struct{}
	goroutinesWg sync.WaitGroup
	metrics      *reporterMetrics
}

// NewFactory returns a ProviderFactory for the signoz meter reporter.
func NewFactory(
	licensing licensing.Licensing,
	telemetryStore telemetrystore.TelemetryStore,
	sqlstore sqlstore.SQLStore,
	orgGetter organization.Getter,
	zeus zeus.Zeus,
) factory.ProviderFactory[meterreporter.Reporter, meterreporter.Config] {
	return factory.NewProviderFactory(
		factory.MustNewName("signoz"),
		func(ctx context.Context, providerSettings factory.ProviderSettings, config meterreporter.Config) (meterreporter.Reporter, error) {
			return newProvider(ctx, providerSettings, config, licensing, telemetryStore, sqlstore, orgGetter, zeus)
		},
	)
}

func newProvider(
	_ context.Context,
	providerSettings factory.ProviderSettings,
	config meterreporter.Config,
	licensing licensing.Licensing,
	telemetryStore telemetrystore.TelemetryStore,
	sqlstore sqlstore.SQLStore,
	orgGetter organization.Getter,
	zeus zeus.Zeus,
) (*Provider, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/SigNoz/signoz/ee/meterreporter/signozmeterreporter")

	metrics, err := newReporterMetrics(settings.Meter())
	if err != nil {
		return nil, err
	}

	meters, err := meterreporter.DefaultMeters()
	if err != nil {
		return nil, err
	}

	return &Provider{
		settings: settings,
		config:   config,
		meters:   meters,
		deps: meterreporter.CollectorDeps{
			TelemetryStore: telemetryStore,
			SQLStore:       sqlstore,
		},
		licensing: licensing,
		orgGetter: orgGetter,
		zeus:      zeus,
		healthyC:  make(chan struct{}),
		stopC:     make(chan struct{}),
		metrics:   metrics,
	}, nil
}

// Start runs an initial tick and then loops on the configured interval until
// Stop is called. Start blocks until the goroutine returns, matching the
// factory.Service contract used across the codebase.
func (provider *Provider) Start(ctx context.Context) error {
	close(provider.healthyC)

	provider.goroutinesWg.Add(1)
	go func() {
		defer provider.goroutinesWg.Done()

		provider.runTick(ctx)

		ticker := time.NewTicker(provider.config.Interval)
		defer ticker.Stop()

		for {
			select {
			case <-provider.stopC:
				return
			case <-ticker.C:
				provider.runTick(ctx)
			}
		}
	}()

	provider.goroutinesWg.Wait()
	return nil
}

// Stop requests the reporter to stop, waits for the in-flight tick (bounded by
// Config.Timeout) to complete, and returns.
func (provider *Provider) Stop(_ context.Context) error {
	<-provider.healthyC
	select {
	case <-provider.stopC:
		// already closed
	default:
		close(provider.stopC)
	}
	provider.goroutinesWg.Wait()
	return nil
}

func (provider *Provider) Healthy() <-chan struct{} {
	return provider.healthyC
}

// runTick executes one collect-and-ship cycle under Config.Timeout. Errors are
// logged and counted; they do not propagate because the reporter must keep
// ticking on subsequent intervals.
func (provider *Provider) runTick(parentCtx context.Context) {
	provider.metrics.ticks.Add(parentCtx, 1)

	ctx, cancel := context.WithTimeout(parentCtx, provider.config.Timeout)
	defer cancel()

	if err := provider.tick(ctx); err != nil {
		provider.settings.Logger().ErrorContext(ctx, "meter reporter tick failed", errors.Attr(err), slog.Duration("timeout", provider.config.Timeout))
	}
}
