<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentRequest extends Model
{
    protected $table = 'payment_requests';

    protected $fillable = [
        'customer_id',
        'trxid',
        'amount',
        'bill_month',
        'status',
        'request_payload',
        'response_payload',
        'ip_address',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
    ];
}
