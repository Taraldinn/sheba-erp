package customer

import (
    "context"

    "uuid"

    requestcontext "github.com/Taraldinn/sheba-erp/backend-go/internal/platform/context"
)

type Customer struct {
    ID             uuid.UUID
    OrganizationID uuid.UUID
    CustomerCode   string
    PPPoEUsername  string
}

type Repository interface {
    Create(ctx context.Context, scope requestcontext.Scope, customer *Customer) error
    Get(ctx context.Context, scope requestcontext.Scope, id uuid.UUID) (*Customer, error)
    List(ctx context.Context, scope requestcontext.Scope) ([]*Customer, error)
}
