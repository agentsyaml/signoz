package meterreporter

import (
	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/factory"
)

var (
	ErrCodeInvalidInput = errors.MustNewCode("meterreporter_invalid_input")
	ErrCodeReportFailed = errors.MustNewCode("meterreporter_report_failed")
)

// Dimension keys automatically attached to every Reading.
const (
	DimensionAggregation    = "signoz.billing.aggregation"
	DimensionUnit           = "signoz.billing.unit"
	DimensionOrganizationID = "signoz.billing.organization.id"
	DimensionRetentionDays  = "signoz.billing.retention.days"
)

// Reporter periodically collects meter values via the query service and ships
// them to Zeus. Implementations must satisfy factory.ServiceWithHealthy so the
// signoz registry can wait on startup and request graceful shutdown.
type Reporter interface {
	factory.ServiceWithHealthy
}
