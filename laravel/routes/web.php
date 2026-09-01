<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Admin\BkashAdminController;

/*
|--------------------------------------------------------------------------
| Web Routes - bKash Pay Bill Administration
|--------------------------------------------------------------------------
*/

Route::prefix('admin/bkash')->middleware(['web', 'auth'])->group(function () {
    Route::match(['get', 'post'], '/settings', [BkashAdminController::class, 'settings'])->name('admin.bkash.settings');
    Route::get('/transactions', [BkashAdminController::class, 'transactions'])->name('admin.bkash.transactions');
    Route::get('/failed-transactions', [BkashAdminController::class, 'failedTransactions'])->name('admin.bkash.failed');
    Route::post('/failed-transactions/{id}/retry', [BkashAdminController::class, 'retryTransaction'])->name('admin.bkash.retry');
    Route::match(['get', 'post'], '/reconciliation', [BkashAdminController::class, 'reconciliation'])->name('admin.bkash.reconciliation');
    Route::get('/reports', [BkashAdminController::class, 'reports'])->name('admin.bkash.reports');
    Route::get('/transactions/export', [BkashAdminController::class, 'exportCsv'])->name('admin.bkash.export');
});
