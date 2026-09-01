<?php
class IpWhitelist {
    public static function check($tenantData, Request $request) {
        if (!empty($tenantData['ip_whitelist'])) {
            $allowed_ips = json_decode($tenantData['ip_whitelist'], true);
            $client_ip = $_SERVER['REMOTE_ADDR'];
            // basic check. Real app should handle proxies HTTP_X_FORWARDED_FOR carefully
            if (is_array($allowed_ips) && !empty($allowed_ips)) {
                if (!in_array($client_ip, $allowed_ips)) {
                    Logger::audit("Blocked IP $client_ip against whitelist for tenant " . $tenantData['id']);
                    Response::error('IP Address not allowed', 'IP_NOT_WHITELISTED', 403, $request->getRequestId());
                }
            }
        }
    }
}
