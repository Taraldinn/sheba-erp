@extends('layouts.app')

@section('content')
<div class="container-fluid py-4">
    <div class="row justify-content-center">
        <div class="col-lg-8 col-md-10">
            <!-- Breadcrumbs -->
            <nav aria-label="breadcrumb" class="mb-4">
                <ol class="breadcrumb bg-transparent p-0 mb-0">
                    <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">Payments</a></li>
                    <li class="breadcrumb-item active fw-bold text-dark" aria-current="page">Gateway Settings</li>
                </ol>
            </nav>

            @if(session('success'))
                <div class="alert alert-success alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="alert">
                    <i class="fas fa-check-circle me-2"></i> {{ session('success') }}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            @endif

            <div class="card border-0 shadow-lg rounded-3 overflow-hidden">
                <div class="card-header border-0 text-white py-3" style="background: linear-gradient(135deg, #e11d48, #be123c);">
                    <div class="d-flex align-items-center">
                        <div class="bg-white text-rose-600 rounded-circle p-2 d-flex justify-content-center align-items-center me-3" style="width: 40px; height: 40px;">
                            <i class="fas fa-wallet fa-lg text-danger"></i>
                        </div>
                        <div>
                            <h5 class="card-title fw-bold mb-0">bKash Pay Bill Outbound API Setup</h5>
                            <small class="opacity-75">Manage outbound credentials and environment for real-time payments</small>
                        </div>
                    </div>
                </div>
                <div class="card-body p-4 bg-light">
                    <form action="{{ route('admin.bkash.settings') }}" method="POST">
                        @csrf
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label for="username" class="form-label fw-bold text-muted small">bKash API Username</label>
                                <input type="text" class="form-control rounded-3 border-gray-300 shadow-sm" id="username" name="username" value="{{ $gateway ? $gateway->username : '' }}" required>
                            </div>
                            <div class="col-md-6">
                                <label for="password" class="form-label fw-bold text-muted small">bKash API Password</label>
                                <input type="password" class="form-control rounded-3 border-gray-300 shadow-sm" id="password" name="password" value="{{ $gateway ? $gateway->password : '' }}" required>
                            </div>

                            <div class="col-12">
                                <label for="api_key" class="form-label fw-bold text-muted small">bKash Secret API Key (SHA-256 Secret)</label>
                                <input type="password" class="form-control rounded-3 border-gray-300 shadow-sm" id="api_key" name="api_key" value="{{ $gateway ? $gateway->api_key : '' }}" required>
                            </div>

                            <div class="col-md-6">
                                <label for="environment" class="form-label fw-bold text-muted small">Environment Mode</label>
                                <select class="form-select rounded-3 border-gray-300 shadow-sm" id="environment" name="environment">
                                    <option value="sandbox" {{ ($gateway && $gateway->environment == 'sandbox') ? 'selected' : '' }}>Sandbox / Test Environment</option>
                                    <option value="production" {{ ($gateway && $gateway->environment == 'production') ? 'selected' : '' }}>Production / Live Gateway</option>
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label for="status" class="form-label fw-bold text-muted small">Gateway Status</label>
                                <select class="form-select rounded-3 border-gray-300 shadow-sm" id="status" name="status">
                                    <option value="1" {{ ($gateway && $gateway->status == 1) ? 'selected' : '' }}>Active / Accepting Payments</option>
                                    <option value="0" {{ ($gateway && $gateway->status == 0) ? 'selected' : '' }}>Disabled / Rejecting Requests</option>
                                </select>
                            </div>

                            <div class="col-12">
                                <label for="ip_whitelist" class="form-label fw-bold text-muted small">IP Whitelist (Comma-separated)</label>
                                <textarea class="form-control rounded-3 border-gray-300 shadow-sm" id="ip_whitelist" name="ip_whitelist" rows="2" placeholder="e.g. 103.55.12.1, 103.55.12.2">{{ $gateway ? $gateway->ip_whitelist : '' }}</textarea>
                                <small class="text-muted italic mt-1 d-block">Leave blank to allow requests from any IP address (Not recommended for production).</small>
                            </div>
                        </div>

                        <div class="mt-4 pt-3 border-top d-flex justify-content-end">
                            <button type="submit" class="btn btn-danger px-4 rounded-pill fw-bold shadow-sm" style="background-color: #be123c;">
                                <i class="fas fa-save me-2"></i> Save Settings
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
