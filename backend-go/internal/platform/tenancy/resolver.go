package tenancy

import (
    "context"
    "errors"

    "uuid"

    requestcontext "github.com/Taraldinn/sheba-erp/backend-go/internal/platform/context"
)

var ErrOrganizationNotFound = errors.New("organization not found")

type Organization struct {
    ID       uuid.UUID
    Slug     string
    IsActive bool
}

type Resolver interface {
    Resolve(ctx context.Context, host string) (Organization, error)
}

type ScopeFactory interface {
    Build(ctx context.Context, principalID uuid.UUID, organization Organization) (requestcontext.Scope, error)
}
