package meterreporter

import (
	"time"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/factory"
)

var _ factory.Config = (*Config)(nil)

type Config struct {
	// Provider picks the reporter implementation. "noop" is the default and is
	// what community builds ship; "signoz" is the enterprise cron-based reporter.
	Provider string `mapstructure:"provider"`

	// Interval is how often the reporter ticks (collect + ship). The validator
	// enforces a 5m floor — any sooner and we'd hammer ClickHouse for nothing,
	// since Zeus UPSERTs inside a UTC day anyway.
	Interval time.Duration `mapstructure:"interval"`

	// Timeout bounds a single tick (collect + marshal + POST). Must be strictly
	// less than Interval so a slow tick can't overlap the next one.
	Timeout time.Duration `mapstructure:"timeout"`

	// Retry configures exponential backoff around the Zeus POST. Tick-level
	// failures don't propagate — see runTick in the enterprise provider.
	Retry RetryConfig `mapstructure:"retry"`
}

type RetryConfig struct {
	Enabled         bool          `mapstructure:"enabled"`
	InitialInterval time.Duration `mapstructure:"initial_interval"`
	MaxInterval     time.Duration `mapstructure:"max_interval"`
	MaxElapsedTime  time.Duration `mapstructure:"max_elapsed_time"`
}

func newConfig() factory.Config {
	return Config{
		Provider: "noop",
		Interval: 6 * time.Hour,
		Timeout:  30 * time.Second,
		Retry: RetryConfig{
			Enabled:         true,
			InitialInterval: 5 * time.Second,
			MaxInterval:     30 * time.Second,
			MaxElapsedTime:  time.Minute,
		},
	}
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("meterreporter"), newConfig)
}

func (c Config) Validate() error {
	if c.Interval < 5*time.Minute {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::interval must be at least 5m")
	}

	if c.Timeout <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::timeout must be greater than 0")
	}

	if c.Timeout >= c.Interval {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::timeout must be less than meterreporter::interval")
	}

	return nil
}
