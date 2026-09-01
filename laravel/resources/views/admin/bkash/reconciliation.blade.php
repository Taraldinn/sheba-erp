@extends('layouts.app')

@section('content')
<div class="container-fluid py-4">
    <!-- Breadcrumbs -->
    <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb bg-transparent p-0 mb-0">
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">Payments</a></li>
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">bKash Pay Bill</a></li>
            <li class="breadcrumb-item active fw-bold text-dark" aria-current="page">Reconciliation</li>
        </ol>
    </nav>

    @if(session('success'))
        <div class="alert alert-success alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="alert">
            <i class="fas fa-check-circle me-2"></i> {{ session('success') }}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    @endif

    <div class="row g-4">
        <!-- Manual Reconcile Form -->
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm rounded-3">
                <div class="card-header border-0 bg-white py-3 border-bottom">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-tools me-2 text-danger"></i>Manual Reconcile</h6>
                </div>
                <div class="card-body p-4 bg-light">
                    <form action="{{ route('admin.bkash.reconciliation') }}" method="POST">
                        @csrf
                        <div class="mb-3">
                            <label for="trxid" class="form-label text-muted small fw-bold">bKash Transaction ID (TrxId) <span class="text-danger">*</span></label>
                            <input type="text" class="form-control rounded-3 border-gray-300" id="trxid" name="trxid" placeholder="e.g. ABC123456" required>
                        </div>
                        <div class="mb-3">
                            <label for="amount" class="form-label text-muted small fw-bold">Amount Paid (৳) <span class="text-danger">*</span></label>
                            <input type="number" step="0.01" class="form-control rounded-3 border-gray-300" id="amount" name="amount" placeholder="0.00" required>
                        </div>
                        <div class="mb-3">
                            <label for="customer_id" class="form-label text-muted small fw-bold">Select Client (to post transaction) <span class="text-danger">*</span></label>
                            <select class="form-select rounded-3 border-gray-300" id="customer_id" name="customer_id" required>
                                <option value="" disabled selected>Select Customer...</option>
                                @foreach($customers as $c)
                                    <option value="{{ $c->id }}">{{ $c->user_id }} - {{ $c->name }}</option>
                                @endforeach
                            </select>
                        </div>
                        <div class="mb-3">
                            <label for="user_mobile" class="form-label text-muted small fw-bold">Customer Mobile (Optional)</label>
                            <input type="text" class="form-control rounded-3 border-gray-300" id="user_mobile" name="user_mobile">
                        </div>
                        <div class="d-grid mt-4">
                            <button type="submit" class="btn btn-danger rounded-pill fw-bold shadow-sm" style="background-color: #be123c;">
                                <i class="fas fa-check-circle me-1"></i> Reconcile & Recharge
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Reconciliation Logs Table -->
        <div class="col-lg-8">
            <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
                <div class="card-header border-0 bg-white py-3 border-bottom">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-history me-2 text-danger"></i>Reconciliation & Discrepancy Logs</h6>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light text-muted small uppercase">
                            <tr>
                                <th class="ps-3">TrxId</th>
                                <th>Amount</th>
                                <th>Gateway Status</th>
                                <th>System Status</th>
                                <th>Is Reconciled</th>
                                <th>Reconciled At</th>
                                <th class="pe-3">Handled By</th>
                            </tr>
                        </thead>
                        <tbody>
                            @forelse($reconciliations as $rec)
                                <tr>
                                    <td class="ps-3 fw-bold text-dark">{{ $rec->trxid }}</td>
                                    <td class="fw-bold text-dark">৳{{ number_format($rec->amount, 2) }}</td>
                                    <td><span class="badge bg-light text-dark fw-normal">{{ ucfirst($rec->gateway_status) }}</span></td>
                                    <td><span class="badge bg-light text-dark fw-normal">{{ ucfirst($rec->system_status) }}</span></td>
                                    <td>
                                        @if($rec->is_reconciled)
                                            <span class="badge rounded-pill bg-success-light text-success px-3 py-1">
                                                <i class="fas fa-check-circle me-1"></i> Yes
                                            </span>
                                        @else
                                            <span class="badge rounded-pill bg-warning-light text-warning px-3 py-1">
                                                <i class="fas fa-hourglass-half me-1"></i> Pending
                                            </span>
                                        @endif
                                    </td>
                                    <td class="text-muted small">{{ $rec->reconciled_at ?? 'N/A' }}</td>
                                    <td class="pe-3 text-muted small fw-bold">{{ $rec->reconciled_by ?? 'System' }}</td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        <i class="fas fa-inbox fa-2x mb-2 d-block"></i> No reconciliation transactions logged.
                                    </td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
                @if($reconciliations->hasPages())
                    <div class="card-footer bg-white border-0 py-3 border-top">
                        {{ $reconciliations->links() }}
                    </div>
                @endif
            </div>
        </div>
    </div>
</div>
@endsection
