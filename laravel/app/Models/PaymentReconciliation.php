<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentReconciliation extends Model
{
    protected $table = 'payment_reconciliation';

    protected $fillable = [
        'trxid',
        'amount',
        'gateway_status',
        'system_status',
        'is_reconciled',
        'reconciled_at',
        'reconciled_by',
    ];

    protected $casts = [
        'is_reconciled' => 'boolean',
        'reconciled_at' => 'datetime',
    ];
}
