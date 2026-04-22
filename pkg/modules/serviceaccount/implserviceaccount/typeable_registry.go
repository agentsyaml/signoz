package implserviceaccount

import (
	"github.com/SigNoz/signoz/pkg/authz"
	"github.com/SigNoz/signoz/pkg/types/authtypes"
	"github.com/SigNoz/signoz/pkg/types/serviceaccounttypes"
	"github.com/SigNoz/signoz/pkg/valuer"
)

// typeableRegistry is a standalone RegisterTypeable implementation that can be
// used independently of the module lifecycle. This is needed because authz
// initialization requires RegisterTypeable entries before the service account
// module is created (the module depends on authz).
type typeableRegistry struct{}

func NewTypeableRegistry() authz.RegisterTypeable {
	return &typeableRegistry{}
}

func (registry *typeableRegistry) MustGetTypeables() []authtypes.Typeable {
	return []authtypes.Typeable{
		serviceaccounttypes.TypeableMetaResourceServiceAccount,
		serviceaccounttypes.TypeableMetaResourcesServiceAccounts,
	}
}

func (registry *typeableRegistry) MustGetManagedRoleTransactions() map[string][]*authtypes.Transaction {
	return map[string][]*authtypes.Transaction{
		authtypes.SigNozAdminRoleName: {
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationCreate,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResources,
						Name: serviceaccounttypes.TypeableMetaResourcesServiceAccounts.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResources, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationList,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResources,
						Name: serviceaccounttypes.TypeableMetaResourcesServiceAccounts.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResources, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationRead,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResource,
						Name: serviceaccounttypes.TypeableMetaResourceServiceAccount.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResource, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationUpdate,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResource,
						Name: serviceaccounttypes.TypeableMetaResourceServiceAccount.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResource, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationDelete,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResource,
						Name: serviceaccounttypes.TypeableMetaResourceServiceAccount.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResource, "*"),
				),
			},
		},
		authtypes.SigNozEditorRoleName: {
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationList,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResources,
						Name: serviceaccounttypes.TypeableMetaResourcesServiceAccounts.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResources, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationRead,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResource,
						Name: serviceaccounttypes.TypeableMetaResourceServiceAccount.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResource, "*"),
				),
			},
		},
		authtypes.SigNozViewerRoleName: {
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationList,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResources,
						Name: serviceaccounttypes.TypeableMetaResourcesServiceAccounts.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResources, "*"),
				),
			},
			{
				ID:       valuer.GenerateUUID(),
				Relation: authtypes.RelationRead,
				Object: *authtypes.MustNewObject(
					authtypes.Resource{
						Type: authtypes.TypeMetaResource,
						Name: serviceaccounttypes.TypeableMetaResourceServiceAccount.Name(),
					},
					authtypes.MustNewSelector(authtypes.TypeMetaResource, "*"),
				),
			},
		},
	}
}
