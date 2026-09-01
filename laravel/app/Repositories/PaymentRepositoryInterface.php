<?php

namespace App\Repositories;

use App\Models\Customer;
use App\Models\PaymentGateway;
use App\Models\PaymentTransaction;
use App\Models\PaymentRequest;

interface PaymentRepositoryInterface
{
    public function getGatewayCredentials(string $gatewayName): ?PaymentGateway;
    public function findCustomerByUserId(string $userId): ?Customer;
    public function existsTransactionByTrxId(string $trxId): bool;
    public function createTransaction(array $data): PaymentTransaction;
    public function createPaymentRequest(array $data): PaymentRequest;
    public function updatePaymentRequest(int $id, array $data): bool;
}
