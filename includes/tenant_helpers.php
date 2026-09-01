<?php
// Function already handles the logic or will be added if not.
// Adding the assertTenantOwnership helper
if (!function_exists('assertTenantOwnership')) {
    function assertTenantOwnership(PDO $pdo, $table, $id, $tenantIdColumn = 'tenant_id', $expectedTenantId = null) {
        if ($expectedTenantId === null) {
            $expectedTenantId = defined('CURRENT_TENANT') ? CURRENT_TENANT : null;
        }
        if (!$expectedTenantId) return true; // Single tenant fallback

        $stmt = $pdo->prepare("SELECT $tenantIdColumn FROM $table WHERE id = ?");
        $stmt->execute([$id]);
        $owner = $stmt->fetchColumn();

        if ($owner !== false && $owner != $expectedTenantId) {
            http_response_code(403);
            exit("Access Denied: Tenant Isolation Violation. You do not own this resource.");
        }
        return true;
    }
}
