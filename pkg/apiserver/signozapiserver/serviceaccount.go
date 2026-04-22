package signozapiserver

import (
	"net/http"

	"github.com/SigNoz/signoz/pkg/http/handler"
	"github.com/SigNoz/signoz/pkg/types"
	"github.com/SigNoz/signoz/pkg/types/authtypes"
	"github.com/SigNoz/signoz/pkg/types/serviceaccounttypes"
	"github.com/gorilla/mux"
)

var (
	serviceAccountAdminRoles = []string{
		authtypes.SigNozAdminRoleName,
	}
	serviceAccountReadRoles = []string{
		authtypes.SigNozAdminRoleName,
		authtypes.SigNozEditorRoleName,
		authtypes.SigNozViewerRoleName,
	}
)

func serviceAccountCollectionSelectorCallback(_ *http.Request, _ authtypes.Claims) ([]authtypes.Selector, error) {
	return []authtypes.Selector{
		authtypes.MustNewSelector(authtypes.TypeMetaResources, authtypes.WildCardSelectorString),
	}, nil
}

func serviceAccountInstanceSelectorCallback(req *http.Request, _ authtypes.Claims) ([]authtypes.Selector, error) {
	id := mux.Vars(req)["id"]
	return []authtypes.Selector{
		authtypes.MustNewSelector(authtypes.TypeMetaResource, id),
		authtypes.MustNewSelector(authtypes.TypeMetaResource, authtypes.WildCardSelectorString),
	}, nil
}

func (provider *provider) addServiceAccountRoutes(router *mux.Router) error {
	// POST /api/v1/service_accounts — Create (admin only)
	if err := router.Handle("/api/v1/service_accounts", handler.New(provider.authZ.Check(provider.serviceAccountHandler.Create, authtypes.RelationCreate, serviceaccounttypes.TypeableMetaResourcesServiceAccounts, serviceAccountCollectionSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "CreateServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Create service account",
		Description:         "This endpoint creates a service account",
		Request:             new(serviceaccounttypes.PostableServiceAccount),
		RequestContentType:  "",
		Response:            new(types.Identifiable),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusCreated,
		ErrorStatusCodes:    []int{http.StatusBadRequest, http.StatusConflict},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPost).GetError(); err != nil {
		return err
	}

	// GET /api/v1/service_accounts — List (admin, editor, viewer)
	if err := router.Handle("/api/v1/service_accounts", handler.New(provider.authZ.Check(provider.serviceAccountHandler.List, authtypes.RelationList, serviceaccounttypes.TypeableMetaResourcesServiceAccounts, serviceAccountCollectionSelectorCallback, serviceAccountReadRoles), handler.OpenAPIDef{
		ID:                  "ListServiceAccounts",
		Tags:                []string{"serviceaccount"},
		Summary:             "List service accounts",
		Description:         "This endpoint lists the service accounts for an organisation",
		Request:             nil,
		RequestContentType:  "",
		Response:            make([]*serviceaccounttypes.ServiceAccount, 0),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	// GET /api/v1/service_accounts/me — GetMe (open access, self)
	if err := router.Handle("/api/v1/service_accounts/me", handler.New(provider.authZ.OpenAccess(provider.serviceAccountHandler.GetMe), handler.OpenAPIDef{
		ID:                  "GetMyServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Gets my service account",
		Description:         "This endpoint gets my service account",
		Request:             nil,
		RequestContentType:  "",
		Response:            new(serviceaccounttypes.ServiceAccountWithRoles),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     nil,
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	// GET /api/v1/service_accounts/{id} — Get (admin, editor, viewer)
	if err := router.Handle("/api/v1/service_accounts/{id}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.Get, authtypes.RelationRead, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountReadRoles), handler.OpenAPIDef{
		ID:                  "GetServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Gets a service account",
		Description:         "This endpoint gets an existing service account",
		Request:             nil,
		RequestContentType:  "",
		Response:            new(serviceaccounttypes.ServiceAccountWithRoles),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	// GET /api/v1/service_accounts/{id}/roles — GetRoles (admin, editor, viewer)
	if err := router.Handle("/api/v1/service_accounts/{id}/roles", handler.New(provider.authZ.Check(provider.serviceAccountHandler.GetRoles, authtypes.RelationRead, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountReadRoles), handler.OpenAPIDef{
		ID:                  "GetServiceAccountRoles",
		Tags:                []string{"serviceaccount"},
		Summary:             "Gets service account roles",
		Description:         "This endpoint gets all the roles for the existing service account",
		Request:             nil,
		RequestContentType:  "",
		Response:            new([]*authtypes.Role),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	// POST /api/v1/service_accounts/{id}/roles — SetRole (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}/roles", handler.New(provider.authZ.Check(provider.serviceAccountHandler.SetRole, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "CreateServiceAccountRole",
		Tags:                []string{"serviceaccount"},
		Summary:             "Create service account role",
		Description:         "This endpoint assigns a role to a service account",
		Request:             new(serviceaccounttypes.PostableServiceAccountRole),
		RequestContentType:  "",
		Response:            new(types.Identifiable),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusCreated,
		ErrorStatusCodes:    []int{http.StatusBadRequest},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPost).GetError(); err != nil {
		return err
	}

	// DELETE /api/v1/service_accounts/{id}/roles/{rid} — DeleteRole (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}/roles/{rid}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.DeleteRole, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "DeleteServiceAccountRole",
		Tags:                []string{"serviceaccount"},
		Summary:             "Delete service account role",
		Description:         "This endpoint revokes a role from service account",
		Request:             nil,
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodDelete).GetError(); err != nil {
		return err
	}

	// PUT /api/v1/service_accounts/me — UpdateMe (open access, self)
	if err := router.Handle("/api/v1/service_accounts/me", handler.New(provider.authZ.OpenAccess(provider.serviceAccountHandler.UpdateMe), handler.OpenAPIDef{
		ID:                  "UpdateMyServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Updates my service account",
		Description:         "This endpoint gets my service account",
		Request:             new(serviceaccounttypes.UpdatableServiceAccount),
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     nil,
	})).Methods(http.MethodPut).GetError(); err != nil {
		return err
	}

	// PUT /api/v1/service_accounts/{id} — Update (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.Update, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "UpdateServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Updates a service account",
		Description:         "This endpoint updates an existing service account",
		Request:             new(serviceaccounttypes.UpdatableServiceAccount),
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{http.StatusNotFound, http.StatusBadRequest},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPut).GetError(); err != nil {
		return err
	}

	// DELETE /api/v1/service_accounts/{id} — Delete (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.Delete, authtypes.RelationDelete, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "DeleteServiceAccount",
		Tags:                []string{"serviceaccount"},
		Summary:             "Deletes a service account",
		Description:         "This endpoint deletes an existing service account",
		Request:             nil,
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodDelete).GetError(); err != nil {
		return err
	}

	// POST /api/v1/service_accounts/{id}/keys — CreateFactorAPIKey (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}/keys", handler.New(provider.authZ.Check(provider.serviceAccountHandler.CreateFactorAPIKey, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "CreateServiceAccountKey",
		Tags:                []string{"serviceaccount"},
		Summary:             "Create a service account key",
		Description:         "This endpoint creates a service account key",
		Request:             new(serviceaccounttypes.PostableFactorAPIKey),
		RequestContentType:  "",
		Response:            new(serviceaccounttypes.GettableFactorAPIKeyWithKey),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusCreated,
		ErrorStatusCodes:    []int{http.StatusBadRequest, http.StatusConflict},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPost).GetError(); err != nil {
		return err
	}

	// GET /api/v1/service_accounts/{id}/keys — ListFactorAPIKey (admin, editor, viewer)
	if err := router.Handle("/api/v1/service_accounts/{id}/keys", handler.New(provider.authZ.Check(provider.serviceAccountHandler.ListFactorAPIKey, authtypes.RelationRead, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountReadRoles), handler.OpenAPIDef{
		ID:                  "ListServiceAccountKeys",
		Tags:                []string{"serviceaccount"},
		Summary:             "List service account keys",
		Description:         "This endpoint lists the service account keys",
		Request:             nil,
		RequestContentType:  "",
		Response:            make([]*serviceaccounttypes.GettableFactorAPIKey, 0),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	// PUT /api/v1/service_accounts/{id}/keys/{fid} — UpdateFactorAPIKey (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}/keys/{fid}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.UpdateFactorAPIKey, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "UpdateServiceAccountKey",
		Tags:                []string{"serviceaccount"},
		Summary:             "Updates a service account key",
		Description:         "This endpoint updates an existing service account key",
		Request:             new(serviceaccounttypes.UpdatableFactorAPIKey),
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{http.StatusBadRequest, http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPut).GetError(); err != nil {
		return err
	}

	// DELETE /api/v1/service_accounts/{id}/keys/{fid} — RevokeFactorAPIKey (admin only)
	if err := router.Handle("/api/v1/service_accounts/{id}/keys/{fid}", handler.New(provider.authZ.Check(provider.serviceAccountHandler.RevokeFactorAPIKey, authtypes.RelationUpdate, serviceaccounttypes.TypeableMetaResourceServiceAccount, serviceAccountInstanceSelectorCallback, serviceAccountAdminRoles), handler.OpenAPIDef{
		ID:                  "RevokeServiceAccountKey",
		Tags:                []string{"serviceaccount"},
		Summary:             "Revoke a service account key",
		Description:         "This endpoint revokes an existing service account key",
		Request:             nil,
		RequestContentType:  "",
		Response:            nil,
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusNoContent,
		ErrorStatusCodes:    []int{http.StatusNotFound},
		Deprecated:          false,
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodDelete).GetError(); err != nil {
		return err
	}

	return nil
}
