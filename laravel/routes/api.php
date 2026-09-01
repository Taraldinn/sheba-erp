<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\CustomerApiController;
use App\Http\Controllers\Api\V1\PaymentApiController;
use App\Http\Controllers\Api\V1\TicketApiController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::prefix('v1/customer')->group(function () {

    // Dynamic Tenant DB Resolution Middleware (Applies to all endpoints)
    Route::middleware(['tenant.detect'])->group(function () {
        
        // Public Customer Endpoint (Login)
        Route::post('/login', [CustomerApiController::class, 'login']);

        // Protected Customer Endpoints (Sanctum Auth + Rate Limiting)
        Route::middleware(['auth:sanctum', 'throttle:60,1'])->group(function () {
            
            // Profile & Usage Endpoints
            Route::get('/profile', [CustomerApiController::class, 'profile']);
            Route::get('/live-usage', [CustomerApiController::class, 'liveUsage']);
            Route::get('/bill/status', [CustomerApiController::class, 'billStatus']);

            // Payment Endpoints
            Route::post('/payment/paybill', [PaymentApiController::class, 'payBill']);
            Route::get('/payment/history', [PaymentApiController::class, 'history']);

            // CRM / Ticket Endpoints
            Route::post('/ticket/create', [TicketApiController::class, 'createTicket']);
            
        });
    });
});

Route::prefix('v1/bkash')->middleware(['tenant.detect', \App\Http\Middleware\BkashSecurityMiddleware::class])->group(function () {
    Route::post('/check-bill', [\App\Http\Controllers\Api\V1\BkashPayApiController::class, 'checkBill']);
    Route::post('/pay-bill', [\App\Http\Controllers\Api\V1\BkashPayApiController::class, 'payBill']);
    Route::post('/search-transaction', [\App\Http\Controllers\Api\V1\BkashPayApiController::class, 'searchTransaction']);
});

