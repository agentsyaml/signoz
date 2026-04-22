package zeus

import (
	"context"
	"net/http"
	"time"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/types/zeustypes"
)

var (
	ErrCodeUnsupported       = errors.MustNewCode("zeus_unsupported")
	ErrCodeResponseMalformed = errors.MustNewCode("zeus_response_malformed")
)

type Zeus interface {
	// Returns the license for the given key.
	GetLicense(context.Context, string) ([]byte, error)

	// Returns the checkout URL for the given license key.
	GetCheckoutURL(context.Context, string, []byte) ([]byte, error)

	// Returns the portal URL for the given license key.
	GetPortalURL(context.Context, string, []byte) ([]byte, error)

	// Returns the deployment for the given license key.
	GetDeployment(context.Context, string) ([]byte, error)

	// Returns the billing details for the given license key.
	GetMeters(context.Context, string) ([]byte, error)

	// Puts the meters for the given license key using the legacy subscriptions service.
	PutMeters(context.Context, string, []byte) error

	// Puts the meters for the given license key using Zeus.
	PutMetersV2(context.Context, string, []byte) error

	// PutMeterReadings ships TDD-shape meter readings to the v2/meters
	// endpoint. idempotencyKey is propagated as X-Idempotency-Key so Zeus can UPSERT on retries.
	PutMeterReadings(ctx context.Context, licenseKey string, idempotencyKey string, body []byte) error

	// LatestSealed returns the latest UTC day for which any billing meter has
	// a sealed (is_completed=true) reading for the license. A nil return means
	// no sealed rows exist yet (bootstrap case). The cron uses this as a
	// checkpoint to forward-fill sealed windows without tracking local state.
	LatestSealed(ctx context.Context, licenseKey string) (*time.Time, error)

	// Put profile for the given license key.
	PutProfile(context.Context, string, *zeustypes.PostableProfile) error

	// Put host for the given license key.
	PutHost(context.Context, string, *zeustypes.PostableHost) error
}

type Handler interface {
	// API level handler for PutProfile
	PutProfile(http.ResponseWriter, *http.Request)

	// API level handler for getting hosts a slim wrapper around GetDeployment
	GetHosts(http.ResponseWriter, *http.Request)

	// API level handler for PutHost
	PutHost(http.ResponseWriter, *http.Request)
}
