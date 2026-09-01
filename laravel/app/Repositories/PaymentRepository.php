<?php

namespace App\Repositories;

use App\Models\Customer;
use App\Models\PaymentGateway;
use App\Models\PaymentTransaction;
use App\Models\PaymentRequest;

class PaymentRepository implements PaymentRepositoryInterface
{
    public function getGatewayCredentials(string $gatewayName): ?PaymentGateway
    {
        return PaymentGateway::where('gateway_name', $gatewayName)
            ->where('status', 1)
            ->first();
    }

    public function findCustomerByUserId(string $userId): ?Customer
    {
        return Customer::where('user_id', $userId)->first();
    }

    public function existsTransactionByTrxId(string $trxId): bool
    {
        return PaymentTransaction::where('trxid', $trxId)->exists();
    }

    public function createTransaction(array $data): PaymentTransaction
    {
        return PaymentTransaction::create($data);
    }

    public function createPaymentRequest(array $data): PaymentRequest
    {
        return PaymentRequest::create($data);
    }

    public function updatePaymentRequest(int $id, array $data): bool
    {
        $request = PaymentRequest::find($id);
        if ($request) {
            return $request->update($data);
        }
        return false;
    }
}
