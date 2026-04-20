package meterreportertypes

import (
	"regexp"

	"github.com/SigNoz/signoz/pkg/errors"
)

var nameRegex = regexp.MustCompile(`^[a-z][a-z0-9_.]+$`)

// Name is a concrete type for a meter name. Dotted namespace identifiers like
// "signoz.meter.log.count" are permitted; arbitrary strings are not, to avoid
// typos silently producing distinct meter rows at Zeus.
type Name struct {
	s string
}

func NewName(s string) (Name, error) {
	if !nameRegex.MatchString(s) {
		return Name{}, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid meter name: %s", s)
	}

	return Name{s: s}, nil
}

func MustNewName(s string) Name {
	name, err := NewName(s)
	if err != nil {
		panic(err)
	}

	return name
}

func (n Name) String() string {
	return n.s
}

func (n Name) IsZero() bool {
	return n.s == ""
}
