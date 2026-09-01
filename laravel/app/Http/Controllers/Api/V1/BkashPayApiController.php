<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\BkashCheckBillRequest;
use App\Http\Requests\BkashPayBillRequest;
use App\Http\Requests\BkashSearchTransactionRequest;
use App\Services\BkashPaymentService;
use App\Models\PaymentRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BkashPayApiController extends Controller
{
    protected $paymentService;

    public function __construct(BkashPaymentService $paymentService)
    {
        $this->paymentService = $paymentService;
    }

    /**
     * Check Bill API
     * POST /api/v1/bkash/check-bill
     */
    public function checkBill(BkashCheckBillRequest $request)
    {
        $gateway = $request->attributes->get('bkash_gateway');

        // Verify credentials
        if ($gateway->username !== $request->input('UserName') || $gateway->password !== $request->input('Password')) {
            $this->logRequest(null, null, null, 'auth_error', $request, ['ErrorCode' => '403', 'ErrorMsg' => 'Authentication Failed']);
            return response()->json([
                'ErrorCode' => '403',
                'ErrorMsg' => 'Authentication Failed'
            ], 403);
        }

        $res = $this->paymentService->checkBill($request->input('CustomerNo'));

        if ($res['status'] !== 200) {
            $code = strval($res['status']);
            $this->logRequest(null, null, null, 'failed', $request, ['ErrorCode' => $code, 'ErrorMsg' => $res['message']]);
            return response()->json([
                'ErrorCode' => $code,
                'ErrorMsg' => $res['message']
            ], $res['status']);
        }

        $responseBody = [
            'ErrorCode' => '200',
            'ErrorMsg' => 'Successful',
            'ConsumerName' => $res['consumer_name'],
            'BillMonth' => $res['bill_month'],
            'BillAmount' => strval($res['bill_amount']),
            'BillDueDate' => $res['due_date']
        ];

        $this->logRequest($res['customer']->id, null, $res['bill_amount'], 'success', $request, $responseBody);

        return response()->json($responseBody, 200);
    }

    /**
     * Pay Bill API
     * POST /api/v1/bkash/pay-bill
     */
    public function payBill(BkashPayBillRequest $request)
    {
        $gateway = $request->attributes->get('bkash_gateway');

        // Verify credentials
        if ($gateway->username !== $request->input('UserName') || $gateway->password !== $request->input('Password')) {
            $this->logRequest(null, $request->input('TrxId'), $request->input('Amount'), 'auth_error', $request, ['ErrorCode' => '403', 'ErrorMsg' => 'Authentication Failed']);
            return response()->json([
                'ErrorCode' => '403',
                'ErrorMsg' => 'Authentication Failed'
            ], 403);
        }

        $paymentData = [
            'customer_no' => $request->input('CustomerNo'),
            'amount' => $request->input('Amount'),
            'trx_id' => $request->input('TrxId'),
            'user_mobile' => $request->input('UserMobileNumber'),
            'pay_time' => $request->input('PayTime'),
        ];

        $res = $this->paymentService->payBill($paymentData);

        if ($res['status'] !== 200) {
            $code = isset($res['code']) ? $res['code'] : strval($res['status']);
            $this->logRequest(null, $request->input('TrxId'), $request->input('Amount'), 'failed', $request, ['ErrorCode' => $code, 'ErrorMsg' => $res['message']]);
            return response()->json([
                'ErrorCode' => $code,
                'ErrorMsg' => $res['message']
            ], $res['status']);
        }

        $responseBody = [
            'ErrorCode' => '200',
            'ErrorMsg' => 'Successful',
            'TotalAmount' => strval($res['total_amount']),
            'TrxId' => $res['trx_id'],
            'RefNumber' => $res['ref_number']
        ];

        // Fetch customer id dynamically for logging
        $customer = \App\Models\Customer::where('user_id', $request->input('CustomerNo'))->first();
        $customerId = $customer ? $customer->id : null;

        $this->logRequest($customerId, $res['trx_id'], $res['total_amount'], 'success', $request, $responseBody);

        return response()->json($responseBody, 200);
    }

    /**
     * Search Transaction API
     * POST /api/v1/bkash/search-transaction
     */
    public function searchTransaction(BkashSearchTransactionRequest $request)
    {
        $trx = $this->paymentService->searchTransaction($request->input('TrxId'));

        if (!$trx) {
            return response()->json([
                'ErrorCode' => '404',
                'ErrorMsg' => 'Data Not Found'
            ], 404);
        }

        // Format created_at to MiddlewarePayTime format (YYYYMMDDHHMMSS)
        $payTime = $trx->created_at ? $trx->created_at->format('YmdHis') : now()->format('YmdHis');

        return response()->json([
            'ErrorCode' => '200',
            'ErrorMsg' => 'Successful',
            'TotalAmount' => strval($trx->amount),
            'TrxId' => $trx->trxid,
            'MiddlewarePayTime' => $payTime
        ], 200);
    }

    /**
     * Helper to log incoming requests.
     */
    private function logRequest($customerId, $trxId, $amount, $status, Request $request, array $responsePayload)
    {
        try {
            PaymentRequest::create([
                'customer_id' => $customerId,
                'trxid' => $trxId,
                'amount' => $amount,
                'bill_month' => date('mY'),
                'status' => $status,
                'request_payload' => $request->all(),
                'response_payload' => $responsePayload,
                'ip_address' => $request->ip()
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to log bKash PaymentRequest: " . $e->getMessage());
        }
    }
}
