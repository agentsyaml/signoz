package querybuildertypesv5

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractReferencedQueryNamesFromAggregationReferences(t *testing.T) {
	formula := QueryBuilderFormula{Expression: "[A.0] + [b.count] + [A.total]"}
	names, err := formula.ExtractReferencedQueryNames()
	require.NoError(t, err)
	require.Equal(t, []string{"A", "b"}, names)
}
