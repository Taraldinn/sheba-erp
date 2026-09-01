<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'users';

    protected $fillable = [
        'name',
        'phone',
        'address',
        'user_id',
        'password',
        'user_package',
        'bill_amount',
        'joining_date',
        'status',
        'router_id',
        'manager_id',
        'current_bill_date',
        'bill_position',
        'credit_taken',
        'credit_days',
        'phone2',
        'nid',
        'onu_mac',
        'connection_type',
        'remarks',
        'zone_id',
        'tj_box_name',
        'due',
        'discount',
        'lat_long',
        'client_type',
        'district',
        'thana',
        'intended_router_name',
        'profile_pic',
        'last_seen',
        'promise_enabled',
        'promise_date',
    ];

    protected $hidden = [
        'password',
    ];
}
