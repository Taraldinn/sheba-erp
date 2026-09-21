# Tenancy Boundary

This package defines the contract between the transport/control-plane layer and the ERP core.

## Rules

1. Resolve organization identity from a trusted server-side source.
2. Never accept organization identity from a client-controlled tenant header, query parameter, or body field.
3. Convert the resolved organization and authenticated principal into an immutable request scope.
4. Pass the scope into application services and repositories.
5. Background jobs must serialize the organization ID explicitly.
6. Repository implementations must enforce organization predicates for organization-owned records.
7. Platform administrators may operate across organizations only through explicit control-plane use cases.
8. Domain packages must not perform HTTP/host resolution. They receive the already-authorized scope from application services.

The first implementation uses shared PostgreSQL tables with organization_id. A future dedicated database can be introduced behind infrastructure without changing domain APIs.
