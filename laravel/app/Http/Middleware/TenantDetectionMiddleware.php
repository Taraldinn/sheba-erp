<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Config;

class TenantDetectionMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse)  $next
     * @return \Illuminate\Http\Response|\Illuminate\Http\RedirectResponse
     */
    public function handle(Request $request, Closure $next)
    {
        // 1. Resolve subdomain or header
        $host = $request->header('Host') ?? $request->getHost();
        $hostParts = explode('.', $host);
        $subdomain = count($hostParts) > 2 ? $hostParts[0] : null;

        $tenantHeader = $request->header('X-Tenant-ID') ?? $request->header('X-Tenant-Key') ?? $subdomain;

        if (!$tenantHeader) {
            return response()->json([
                'status' => 'error',
                'message' => 'Tenant identification failed. Subdomain or X-Tenant-ID missing.'
            ], 400);
        }

        // 2. Fetch tenant credentials from master database connection
        // (Assumes connection named 'mysql' or 'master' points to SaaS registry)
        $tenant = DB::connection('mysql')
            ->table('tenants')
            ->where('subdomain', $tenantHeader)
            ->orWhere('name', $tenantHeader)
            ->first();

        if (!$tenant) {
            return response()->json([
                'status' => 'error',
                'message' => 'Tenant not found.'
            ], 404);
        }

        if ($tenant->status !== 'active') {
            return response()->json([
                'status' => 'error',
                'message' => 'Tenant account is suspended.'
            ], 403);
        }

        // 3. Configure the dynamic tenant connection
        Config::set('database.connections.tenant.host', env('DB_HOST', '127.0.0.1'));
        Config::set('database.connections.tenant.database', $tenant->db_name);
        Config::set('database.connections.tenant.username', $tenant->db_user);
        Config::set('database.connections.tenant.password', $tenant->db_pass);

        // 4. Purge old connection cache and reconnect
        DB::purge('tenant');
        DB::reconnect('tenant');

        // Set default database connection to resolved tenant database for the duration of this request
        DB::setDefaultConnection('tenant');

        // Store resolved tenant on request attributes
        $request->attributes->set('tenant', $tenant);

        return $next($request);
    }
}
