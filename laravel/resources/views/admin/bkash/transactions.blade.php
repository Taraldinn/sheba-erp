@extends('layouts.app')

@section('content')
<div class="container-fluid py-4">
    <!-- Breadcrumbs -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb bg-transparent p-0 mb-0">
                <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">Payments</a></li>
                <li class="breadcrumb-item active fw-bold text-dark" aria-current="page">bKash Pay Bill</li>
                <li class="breadcrumb-item active fw-bold text-muted" aria-current="page">Transactions</li>
            </ol>
        </nav>
        
        <a href="{{ route('admin.bkash.export', request()->all()) }}" class="btn btn-outline-success btn-sm rounded-pill px-3 fw-bold">
            <i class="fas fa-file-export me-1"></i> Export CSV
        </a>
    </div>

    <!-- Filters Card -->
    <div class="card border-0 shadow-sm rounded-3 mb-4">
        <div class="card-body p-3">
            <form action="{{ route('admin.bkash.transactions') }}" method="GET" class="row g-2 align-items-end">
                <div class="col-md-4">
                    <label class="form-label text-muted small fw-bold mb-1">Search Customer, TrxID, Mobile or Ref</label>
                    <input type="text" name="search" class="form-control form-control-sm rounded-3" placeholder="Enter keywords..." value="{{ request('search') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-muted small fw-bold mb-1">Date From</label>
                    <input type="date" name="date_from" class="form-control form-control-sm rounded-3" value="{{ request('date_from') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-muted small fw-bold mb-1">Date To</label>
                    <input type="date" name="date_to" class="form-control form-control-sm rounded-3" value="{{ request('date_to') }}">
                </div>
                <div class="col-md-2 d-grid">
                    <button type="submit" class="btn btn-primary btn-sm rounded-pill fw-bold">
                        <i class="fas fa-filter me-1"></i> Filter
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Table Card -->
    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
        <div class="card-header border-0 bg-white py-3 border-bottom">
            <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-list-ul me-2 text-danger"></i>bKash Pay Bill Transactions Ledger</h6>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light text-muted small uppercase">
                    <tr>
                        <th class="ps-3">Transaction ID</th>
                        <th>Customer ID</th>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Bill Month</th>
                        <th>Reference No</th>
                        <th>Mobile</th>
                        <th>Status</th>
                        <th class="pe-3">Processed At</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($transactions as $tx)
                        <tr>
                            <td class="ps-3 fw-bold text-dark">{{ $tx->trxid }}</td>
                            <td><span class="badge bg-light text-dark fw-normal">{{ $tx->customer ? $tx->customer->user_id : 'N/A' }}</span></td>
                            <td>{{ $tx->customer ? $tx->customer->name : 'N/A' }}</td>
                            <td class="fw-bold text-success">৳{{ number_format($tx->amount, 2) }}</td>
                            <td>{{ date('M Y', strtotime('01-' . substr($tx->bill_month, 0, 2) . '-' . substr($tx->bill_month, 2))) }}</td>
                            <td><code>{{ $tx->ref_number }}</code></td>
                            <td>{{ $tx->user_mobile ?? 'N/A' }}</td>
                            <td>
                                <span class="badge rounded-pill bg-success-light text-success px-3 py-1">
                                    <i class="fas fa-check-circle me-1"></i> Completed
                                </span>
                            </td>
                            <td class="pe-3 text-muted small">{{ $tx->created_at }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="9" class="text-center py-4 text-muted">
                                <i class="fas fa-inbox fa-2x mb-2 d-block"></i> No transactions found matching criteria.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
        @if($transactions->hasPages())
            <div class="card-footer bg-white border-0 py-3 border-top">
                {{ $transactions->links() }}
            </div>
        @endif
    </div>
</div>
@endsection
