<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\PaymentGateway;
use Symfony\Component\HttpFoundation\Response;

class BkashSecurityMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Retrieve the payment gateway credentials for the current tenant database
        $gateway = PaymentGateway::where('gateway_name', 'bkash_pay_bill')
            ->where('status', 1)
            ->first();

        if (!$gateway) {
            return response()->json([
                'ErrorCode' => '403',
                'ErrorMsg' => 'Authentication Failed: Gateway not active'
            ], 403);
        }

        // 2. IP Whitelisting Check
        $clientIp = $request->ip();
        if (!empty($gateway->ip_whitelist)) {
            $allowedIps = array_map('trim', explode(',', $gateway->ip_whitelist));
            if (!in_array($clientIp, $allowedIps)) {
                return response()->json([
                    'ErrorCode' => '403',
                    'ErrorMsg' => "Authentication Failed: IP is not whitelisted"
                ], 403);
            }
        }

        // 3. API Signature Verification
        $signature = $request->header('X-Signature');
        if ($signature) {
            $payload = json_encode($request->all(), JSON_UNESCAPED_SLASHES);
            $computedSignature = hash_hmac('sha256', $payload, $gateway->api_key);
            if (!hash_equals($computedSignature, $signature)) {
                return response()->json([
                    'ErrorCode' => '403',
                    'ErrorMsg' => 'Authentication Failed: Invalid Signature'
                ], 403);
            }
        }

        // Add resolved gateway to request attributes
        $request->attributes->set('bkash_gateway', $gateway);

        return $next($request);
    }
}
