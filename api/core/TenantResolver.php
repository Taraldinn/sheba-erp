<?php
class TenantResolver {
    // Basic tenant resolution functions are contained directly within Auth.php for DB efficiency in this architecture
    // This file acts as an interface or advanced resolver if needed in future (e.g. database routing without Auth)
    public static function resolve(Request $request, PDO $masterDb) {
        $subdomain = $request->getSubdomain();
        $stmt = $masterDb->prepare("SELECT id, db_name, db_user, db_pass, status FROM tenants WHERE subdomain = ?");
        $stmt->execute([$subdomain]);
        return $stmt->fetch();
    }
}
