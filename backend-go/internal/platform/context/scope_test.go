package context

import (
    "context"
    "testing"

    "uuid"
)

func TestScopeRoundTrip(t *testing.T) {
    organizationID := uuid.New()
    principalID := uuid.New()

    scope := Scope{
        OrganizationID: organizationID,
        PrincipalID:    principalID,
    }

    ctx := WithScope(context.Background(), scope)

    got, ok := ScopeFromContext(ctx)
    if !ok {
        t.Fatal("expected scope in context")
    }

    if got.OrganizationID != organizationID {
        t.Fatalf("organization mismatch: got %v want %v", got.OrganizationID, organizationID)
    }

    if got.PrincipalID != principalID {
        t.Fatalf("principal mismatch: got %v want %v", got.PrincipalID, principalID)
    }
}

func TestScopeRequiresOrganization(t *testing.T) {
    scope := Scope{PrincipalID: uuid.New()}

    if err := scope.RequireOrganization(); err == nil {
        t.Fatal("expected organization scope error")
    }
}
