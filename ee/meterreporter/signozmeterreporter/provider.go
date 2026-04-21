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
// invokes every registered Collector against the instance's licensed org, and
// ships the resulting readings to Zeus. Community builds wire a noop provider
// instead, so this type never runs there.
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

// NewFactory wires the signoz meter reporter into the provider registry. The
// returned factory is registered alongside the noop factory so the "provider"
// config field picks the right implementation at startup.
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

// Start runs an initial tick, then loops on Config.Interval until Stop is
// called. It blocks until the loop goroutine returns — that shape matches the
// factory.Service contract the rest of the codebase uses, so the supervisor
// can join on it the same way as other long-running services.
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

// Stop signals the tick loop and waits for any in-flight tick to finish.
// Drain time is bounded by Config.Timeout because every tick runs under that
// deadline, so shutdown can't stall on a hung ClickHouse or Zeus call.
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

// runTick executes one collect-and-ship cycle under Config.Timeout. Errors
// from tick are logged and counted only — they never propagate, because the
// reporter must keep firing on subsequent intervals even if one batch fails.
func (provider *Provider) runTick(parentCtx context.Context) {
	provider.metrics.ticks.Add(parentCtx, 1)

	ctx, cancel := context.WithTimeout(parentCtx, provider.config.Timeout)
	defer cancel()

	if err := provider.tick(ctx); err != nil {
		provider.settings.Logger().ErrorContext(ctx, "meter reporter tick failed", errors.Attr(err), slog.Duration("timeout", provider.config.Timeout))
	}
}
