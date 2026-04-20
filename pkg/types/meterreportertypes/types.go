package meterreportertypes

// Reading is a single meter value sent to Zeus. Zeus UPSERTs on
// (license_key, dimension_hash, timestamp), so repeated readings within the
// same tick window safely overwrite prior values.
type Reading struct {
	// MeterName is the fully-qualified meter identifier.
	MeterName string `json:"meterName"`

	// Value is the aggregated scalar for this (meter, aggregation) pair over the reporting window.
	Value float64 `json:"value"`

	// Timestamp is the window-start in epoch milliseconds (UTC day start).
	Timestamp int64 `json:"timestamp"`

	// IsCompleted is true only for sealed past buckets. In-progress buckets
	// (e.g. the current UTC day) report IsCompleted=false so Zeus knows the value may still change.
	IsCompleted bool `json:"isCompleted"`

	// Dimensions is the per-reading label set.
	Dimensions map[string]string `json:"dimensions"`
}

// PostableMeterReadings is the request body for Zeus.PutMeterReadings.
type PostableMeterReadings struct { // ! Needs fix once zeus contract is setup
	// IdempotencyKey is echoed as the X-Idempotency-Key header and stored by
	// Zeus so retries within the same tick window overwrite rather than duplicate.
	IdempotencyKey string `json:"idempotencyKey"`

	// Readings is the batch of meter values being shipped.
	Readings []Reading `json:"readings"`
}
