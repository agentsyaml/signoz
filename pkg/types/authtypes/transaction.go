package authtypes

import (
	"encoding/json"
	"slices"

	"github.com/SigNoz/signoz/pkg/errors"
	"github.com/SigNoz/signoz/pkg/valuer"
)

type Transaction struct {
	ID       valuer.UUID `json:"-"`
	Relation Relation    `json:"relation" required:"true"`
	Object   Object      `json:"object" required:"true"`
}

type GettableTransaction struct {
	Relation   Relation `json:"relation" required:"true"`
	Object     Object   `json:"object" required:"true"`
	Authorized bool     `json:"authorized" required:"true"`
}

type TransactionWithAuthorization struct {
	Transaction *Transaction
	Authorized  bool
}

func NewTransaction(relation Relation, object Object) (*Transaction, error) {
	if !slices.Contains(TypeableRelations[object.Resource.Type], relation) {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeAuthZInvalidRelation, "invalid relation %s for type %s", relation.StringValue(), object.Resource.Type.StringValue())
	}

	return &Transaction{ID: valuer.GenerateUUID(), Relation: relation, Object: object}, nil
}

func NewGettableTransaction(results []*TransactionWithAuthorization) []*GettableTransaction {
	gettableTransactions := make([]*GettableTransaction, len(results))
	for i, result := range results {
		gettableTransactions[i] = &GettableTransaction{
			Relation:   result.Transaction.Relation,
			Object:     result.Transaction.Object,
			Authorized: result.Authorized,
		}
	}

	return gettableTransactions
}

func (transaction *Transaction) UnmarshalJSON(data []byte) error {
	var shadow = struct {
		Relation Relation
		Object   Object
	}{}

	err := json.Unmarshal(data, &shadow)
	if err != nil {
		return err
	}

	txn, err := NewTransaction(shadow.Relation, shadow.Object)
	if err != nil {
		return err
	}

	*transaction = *txn
	return nil
}
