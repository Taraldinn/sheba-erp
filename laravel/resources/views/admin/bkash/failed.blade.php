@extends('layouts.app')

@section('content')
<div class="container-fluid py-4">
    <!-- Breadcrumbs -->
    <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb bg-transparent p-0 mb-0">
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">Payments</a></li>
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">bKash Pay Bill</a></li>
            <li class="breadcrumb-item active fw-bold text-dark" aria-current="page">Failed Transactions</li>
        </ol>
    </nav>

    @if(session('success'))
        <div class="alert alert-success alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="alert">
            <i class="fas fa-check-circle me-2"></i> {{ session('success') }}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    @endif
    @if(session('error'))
        <div class="alert alert-danger alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="alert">
            <i class="fas fa-exclamation-triangle me-2"></i> {{ session('error') }}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    @endif

    <!-- Table Card -->
    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
        <div class="card-header border-0 bg-white py-3 border-bottom">
            <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-exclamation-circle me-2 text-danger"></i>Failed Requests & API Logs</h6>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light text-muted small uppercase">
                    <tr>
                        <th class="ps-3">Request ID</th>
                        <th>TrxId</th>
                        <th>Customer ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>IP Address</th>
                        <th>Logged At</th>
                        <th>Payloads</th>
                        <th class="pe-3 text-end">Action</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($requests as $req)
                        <tr>
                            <td class="ps-3 fw-bold text-dark">#{{ $req->id }}</td>
                            <td><code class="text-danger">{{ $req->trxid ?? 'N/A' }}</code></td>
                            <td><span class="badge bg-light text-dark fw-normal">{{ $req->customer_id ?? 'N/A' }}</span></td>
                            <td>৳{{ number_format($req->amount ?? 0, 2) }}</td>
                            <td>
                                <span class="badge rounded-pill bg-danger-light text-danger px-3 py-1">
                                    {{ ucfirst($req->status) }}
                                </span>
                            </td>
                            <td><span class="badge bg-light text-muted fw-normal">{{ $req->ip_address }}</span></td>
                            <td class="text-muted small">{{ $req->created_at }}</td>
                            <td>
                                <!-- Button to trigger payload modal -->
                                <button type="button" class="btn btn-outline-secondary btn-xs rounded-pill px-2 py-0" data-bs-toggle="modal" data-bs-target="#payloadModal{{ $req->id }}">
                                    <i class="fas fa-code me-1"></i> View JSON
                                </button>

                                <!-- Payload Modal -->
                                <div class="modal fade" id="payloadModal{{ $req->id }}" tabindex="-1" aria-hidden="true">
                                    <div class="modal-dialog modal-lg modal-dialog-centered">
                                        <div class="modal-content border-0 shadow-lg rounded-3">
                                            <div class="modal-header bg-dark text-white py-3 border-0">
                                                <h5 class="modal-title fw-bold"><i class="fas fa-code me-2"></i>API Payload Logs #{{ $req->id }}</h5>
                                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                                            </div>
                                            <div class="modal-body p-4 bg-light">
                                                <h6 class="fw-bold text-muted mb-2">Request Parameters (bKash Output)</h6>
                                                <pre class="bg-dark text-white p-3 rounded-3 mb-4" style="overflow-x: auto;"><code>{{ json_encode($req->request_payload, JSON_PRETTY_PRINT) }}</code></pre>
                                                
                                                <h6 class="fw-bold text-muted mb-2">Response Sent</h6>
                                                <pre class="bg-dark text-white p-3 rounded-3" style="overflow-x: auto;"><code>{{ json_encode($req->response_payload, JSON_PRETTY_PRINT) }}</code></pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="pe-3 text-end">
                                <form action="{{ route('admin.bkash.retry', $req->id) }}" method="POST" class="d-inline">
                                    @csrf
                                    <button type="submit" class="btn btn-sm btn-danger rounded-pill px-3 fw-bold shadow-sm">
                                        <i class="fas fa-redo me-1"></i> Retry
                                    </button>
                                </form>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="9" class="text-center py-4 text-muted">
                                <i class="fas fa-inbox fa-2x mb-2 d-block"></i> No failed transactions logged.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
        @if($requests->hasPages())
            <div class="card-footer bg-white border-0 py-3 border-top">
                {{ $requests->links() }}
            </div>
        @endif
    </div>
</div>
@endsection
