<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;

class CustomerApiController extends Controller
{
    /**
     * 1. Customer Login API
     * POST /api/v1/customer/login
     */
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'fail',
                'data' => $validator->errors()
            ], 400);
        }

        $username = trim($request->input('username'));
        $password = trim($request->input('password'));

        // Find customer in user table (matches PPPoE user_id, phone, or id)
        $customer = DB::connection('tenant')
            ->table('users')
            ->where('user_id', $username)
            ->orWhere('phone', $username)
            ->orWhere('id', $username)
            ->first();

        if (!$customer) {
            return response()->json([
                'status' => 'error',
                'code' => 'UNAUTHORIZED',
                'message' => 'Invalid username or password'
            ], 401);
        }

        $authenticated = false;
        if (!empty($customer->self_care_password)) {
            // Checks plane text self care password or bcrypt
            if ($password === $customer->self_care_password || Hash::check($password, $customer->self_care_password)) {
                $authenticated = true;
            }
        } else {
            // Fallback: Default password is phone number
            if ($password === $customer->phone) {
                $authenticated = true;
            }
        }

        if (!$authenticated) {
            return response()->json([
                'status' => 'error',
                'code' => 'UNAUTHORIZED',
                'message' => 'Invalid username or password'
            ], 401);
        }

        // Generate Laravel Sanctum Token
        // Wait, for custom DB tables, you can map the User model.
        // Assuming your User Eloquent model uses HasApiTokens:
        // $token = $user->createToken('customer-mobile-app')->plainTextToken;
        // Or if you want a custom token generation to match standard:
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = now()->addDays(30);

        // Record the token (either in personal_access_tokens or a custom table)
        DB::connection('tenant')->table('personal_access_tokens')->insert([
            'tokenable_type' => 'App\Models\Customer',
            'tokenable_id' => $customer->id,
            'name' => 'mobile-app',
            'token' => $tokenHash,
            'abilities' => json_encode(['*']),
            'expires_at' => $expiresAt,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Login successful',
            'access_token' => $token,
            'token_type' => 'Bearer',
            'customer_id' => (int)$customer->id,
            'customer_name' => $customer->name
        ], 200);
    }

    /**
     * 2. Customer Profile API
     * GET /api/v1/customer/profile
     */
    public function profile(Request $request)
    {
        $user = $request->user(); // Resolved by Sanctum Guard
        $customerId = $user->id;

        $customer = DB::connection('tenant')->table('users')->where('id', $customerId)->first();

        if (!$customer) {
            return response()->json([
                'status' => 'error',
                'code' => 'CUSTOMER_NOT_FOUND',
                'message' => 'Customer profile not found'
            ], 404);
        }

        // Fetch zone name
        $zoneName = 'N/A';
        if (!empty($customer->zone_id)) {
            $zoneName = DB::connection('tenant')->table('zones')->where('id', $customer->zone_id)->value('name') ?: 'N/A';
        }

        // Fetch package speed profile
        $speed = 'N/A';
        if (!empty($customer->user_package)) {
            $speed = DB::connection('tenant')->table('mikrotik_services')->where('name', $customer->user_package)->value('rate_limit_profile') ?: 'N/A';
        }

        $due = (float)($customer->due ?? 0);
        $monthlyBill = (float)($customer->bill_amount ?? 0);

        // Resolve negative due balance as advance amount
        $advance = 0.00;
        if ($due < 0) {
            $advance = abs($due);
            $due = 0.00;
        }

        return response()->json([
            'status' => 'success',
            'data' => [
                'customer_id' => (int)$customer->id,
                'name' => $customer->name,
                'mobile' => $customer->phone,
                'email' => $customer->email ?? null,
                'address' => $customer->address,
                'area' => $zoneName,
                'pppoe_username' => $customer->user_id,
                'package_name' => $customer->user_package,
                'package_speed' => $speed,
                'monthly_bill' => $monthlyBill,
                'connection_status' => $customer->status,
                'expire_date' => $customer->current_bill_date,
                'due_amount' => $due,
                'advance_amount' => $advance
            ]
        ], 200);
    }

    /**
     * 3. Live Usage API
     * GET /api/v1/customer/live-usage
     */
    public function liveUsage(Request $request)
    {
        $user = $request->user();
        $customerId = $user->id;

        $customer = DB::connection('tenant')->table('users')->where('id', $customerId)->first();

        if (!$customer) {
            return response()->json([
                'status' => 'error',
                'message' => 'Customer profile not found'
            ], 404);
        }

        $currentRx = 0.00;
        $currentTx = 0.00;

        // Perform live lookup on MikroTik router
        if ($customer->router_id > 0) {
            $router = DB::connection('tenant')->table('routers')->where('id', $customer->router_id)->first();
            if ($router) {
                try {
                    // Inject custom router wrapper (e.g. App\Services\MikrotikApp)
                    $mk = new \App\Services\MikrotikApp($router);
                    if ($mk->isOnline()) {
                        $traffic = $mk->traffic($customer->user_id, true);
                        if ($traffic && isset($traffic['status']) && $traffic['status'] === 'online') {
                            $currentRx = (float)($traffic['down_speed'] ?? 0);
                            $currentTx = (float)($traffic['up_speed'] ?? 0);
                        }
                    }
                } catch (\Exception $ex) {
                    Log::error("Laravel Live Usage MikroTik check failed: " . $ex->getMessage());
                }
            }
        }

        // Query historical usage aggregations
        $dlToday = (float)DB::connection('tenant')->table('user_usage_logs')
            ->where('customer_id', $customerId)
            ->where('usage_date', now()->toDateString())
            ->value('download_bytes') ?? 0;
        $ulToday = (float)DB::connection('tenant')->table('user_usage_logs')
            ->where('customer_id', $customerId)
            ->where('usage_date', now()->toDateString())
            ->value('upload_bytes') ?? 0;

        $sevenDays = DB::connection('tenant')->table('user_usage_logs')
            ->where('customer_id', $customerId)
            ->where('usage_date', '>=', now()->subDays(7)->toDateString())
            ->selectRaw('SUM(download_bytes) as download, SUM(upload_bytes) as upload')
            ->first();
        $dl7 = (float)($sevenDays->download ?? 0);
        $ul7 = (float)($sevenDays->upload ?? 0);

        $thirtyDays = DB::connection('tenant')->table('user_usage_logs')
            ->where('customer_id', $customerId)
            ->where('usage_date', '>=', now()->subDays(30)->toDateString())
            ->selectRaw('SUM(download_bytes) as download, SUM(upload_bytes) as upload')
            ->first();
        $dl30 = (float)($thirtyDays->download ?? 0);
        $ul30 = (float)($thirtyDays->upload ?? 0);

        return response()->json([
            'status' => 'success',
            'data' => [
                'current_rx' => $currentRx, // Mbps
                'current_tx' => $currentTx, // Mbps
                'download_today' => $dlToday,
                'upload_today' => $ulToday,
                'total_today' => $dlToday + $ulToday,
                'download_7days' => $dl7,
                'upload_7days' => $ul7,
                'total_7days' => $dl7 + $ul7,
                'download_30days' => $dl30,
                'upload_30days' => $ul30,
                'total_30days' => $dl30 + $ul30,
                'last_updated' => now()->toDateTimeString()
            ]
        ], 200);
    }

    /**
     * 4. Bill Status API
     * GET /api/v1/customer/bill/status
     */
    public function billStatus(Request $request)
    {
        $user = $request->user();
        $customerId = $user->id;

        $customer = DB::connection('tenant')->table('users')->where('id', $customerId)->first();

        if (!$customer) {
            return response()->json([
                'status' => 'error',
                'message' => 'Customer profile not found'
            ], 404);
        }

        $due = (float)($customer->due ?? 0);
        $monthlyBill = (float)($customer->bill_amount ?? 0);

        // Resolve Negative due balance as advance
        $advance = 0.00;
        if ($due < 0) {
            $advance = abs($due);
            $due = 0.00;
        }

        // Sum of payments this month
        $paidAmount = (float)DB::connection('tenant')->table('payment_gateway_logs')
            ->where('staff_id', $customerId)
            ->where('status', 'COMPLETED')
            ->where('created_at', '>=', now()->startOfMonth()->toDateTimeString())
            ->sum('amount');

        // Fetch last payment details
        $lastPay = DB::connection('tenant')->table('payment_gateway_logs')
            ->where('staff_id', $customerId)
            ->where('status', 'COMPLETED')
            ->orderBy('id', 'desc')
            ->first(['amount', 'created_at']);

        $lastPaymentAmount = $lastPay ? (float)$lastPay->amount : 0.00;
        $lastPaymentDate = $lastPay ? $lastPay->created_at : null;

        $invoiceStatus = ($due > 0) ? 'Unpaid' : 'Paid';

        return response()->json([
            'status' => 'success',
            'data' => [
                'customer_id' => (int)$customer->id,
                'monthly_bill' => $monthlyBill,
                'current_month_bill' => $monthlyBill,
                'paid_amount' => $paidAmount,
                'due_amount' => $due,
                'advance_amount' => $advance,
                'last_payment_amount' => $lastPaymentAmount,
                'last_payment_date' => $lastPaymentDate,
                'next_bill_date' => $customer->current_bill_date,
                'expire_date' => $customer->current_bill_date,
                'invoice_status' => $invoiceStatus,
                'connection_status' => $customer->status
            ]
        ], 200);
    }
}
