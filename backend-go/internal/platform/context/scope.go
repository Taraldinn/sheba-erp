package context

import (
    "context"
    "errors"

    "uuid"
)

type Scope struct {
    OrganizationID  uuid.UUID
    PrincipalID     uuid.UUID
    IsPlatformAdmin bool
}

func (s Scope) Valid() bool {
    return s.OrganizationID != uuid.Nil && s.PrincipalID != uuid.Nil
}

func (s Scope) RequireOrganization() error {
    if s.OrganizationID == uuid.Nil {
        return errors.New("organization scope is required")
    }
    return nil
}

type scopeKey struct{}

func WithScope(ctx context.Context, scope Scope) context.Context {
    return context.WithValue(ctx, scopeKey{}, scope)
}

func ScopeFromContext(ctx context.Context) (Scope, bool) {
    scope, ok := ctx.Value(scopeKey{}).(Scope)
    return scope, ok
}

func MustScope(ctx context.Context) Scope {
    scope, ok := ScopeFromContext(ctx)
    if !ok || !scope.Valid() {
        panic("missing request scope")
    }
    return scope
}
