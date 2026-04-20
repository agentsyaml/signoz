package meterreporter

import (
	"time"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/factory"
)

var _ factory.Config = (*Config)(nil)

type Config struct {
	// Provider selects the reporter implementation (default "noop").
	Provider string `mapstructure:"provider"`

	// Interval is how often the reporter collects and ships meter readings.
	Interval time.Duration `mapstructure:"interval"`

	// Timeout bounds a single collect-and-ship cycle.
	Timeout time.Duration `mapstructure:"timeout"`

	// Retry configures exponential backoff for transient Zeus failures.
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
	if c.Interval < 30*time.Minute {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::interval must be at least 30m")
	}

	if c.Timeout <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::timeout must be greater than 0")
	}

	if c.Timeout >= c.Interval {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidInput, "meterreporter::timeout must be less than meterreporter::interval")
	}

	return nil
}
