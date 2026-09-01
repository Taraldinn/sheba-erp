<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class PaymentGateway extends Model
{
    protected $table = 'payment_gateways';

    protected $fillable = [
        'gateway_name',
        'username',
        'password',
        'api_key',
        'status',
        'environment',
        'ip_whitelist',
    ];

    /**
     * Get decrypted username.
     */
    public function getUsernameAttribute($value)
    {
        if (empty($value)) return $value;
        try {
            return Crypt::decryptString($value);
        } catch (\Exception $e) {
            return $value;
        }
    }

    /**
     * Set encrypted username.
     */
    public function setUsernameAttribute($value)
    {
        $this->attributes['username'] = !empty($value) ? Crypt::encryptString($value) : $value;
    }

    /**
     * Get decrypted password.
     */
    public function getPasswordAttribute($value)
    {
        if (empty($value)) return $value;
        try {
            return Crypt::decryptString($value);
        } catch (\Exception $e) {
            return $value;
        }
    }

    /**
     * Set encrypted password.
     */
    public function setPasswordAttribute($value)
    {
        $this->attributes['password'] = !empty($value) ? Crypt::encryptString($value) : $value;
    }

    /**
     * Get decrypted api_key.
     */
    public function getApiKeyAttribute($value)
    {
        if (empty($value)) return $value;
        try {
            return Crypt::decryptString($value);
        } catch (\Exception $e) {
            return $value;
        }
    }

    /**
     * Set encrypted api_key.
     */
    public function setApiKeyAttribute($value)
    {
        $this->attributes['api_key'] = !empty($value) ? Crypt::encryptString($value) : $value;
    }
}
