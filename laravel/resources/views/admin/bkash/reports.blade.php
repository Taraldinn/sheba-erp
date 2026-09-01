@extends('layouts.app')

@section('content')
<div class="container-fluid py-4">
    <!-- Breadcrumbs -->
    <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb bg-transparent p-0 mb-0">
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">Payments</a></li>
            <li class="breadcrumb-item"><a href="#" class="text-decoration-none text-muted">bKash Pay Bill</a></li>
            <li class="breadcrumb-item active fw-bold text-dark" aria-current="page">Reporting Dashboard</li>
        </ol>
    </nav>

    <!-- Stat Widgets -->
    <div class="row g-3 mb-4">
        <div class="col-md-3">
            <div class="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex align-items-center justify-content-between flex-row">
                <div>
                    <span class="text-muted small fw-bold uppercase d-block mb-1">Today's Collection</span>
                    <h4 class="fw-bold mb-0 text-success">৳{{ number_format($todayCollection, 2) }}</h4>
                </div>
                <div class="bg-success-light text-success rounded-circle p-2 d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                    <i class="fas fa-hand-holding-usd fa-lg"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex align-items-center justify-content-between flex-row">
                <div>
                    <span class="text-muted small fw-bold uppercase d-block mb-1">Monthly Collection</span>
                    <h4 class="fw-bold mb-0 text-primary">৳{{ number_format($monthlyCollection, 2) }}</h4>
                </div>
                <div class="bg-primary-light text-primary rounded-circle p-2 d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                    <i class="fas fa-calendar-alt fa-lg"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex align-items-center justify-content-between flex-row">
                <div>
                    <span class="text-muted small fw-bold uppercase d-block mb-1">Success Rate</span>
                    <h4 class="fw-bold mb-0 text-info">{{ $successRate }}%</h4>
                </div>
                <div class="bg-info-light text-info rounded-circle p-2 d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                    <i class="fas fa-percentage fa-lg"></i>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex align-items-center justify-content-between flex-row">
                <div>
                    <span class="text-muted small fw-bold uppercase d-block mb-1">Failed Requests</span>
                    <h4 class="fw-bold mb-0 text-danger">{{ $failedRequestCount }}</h4>
                </div>
                <div class="bg-danger-light text-danger rounded-circle p-2 d-flex justify-content-center align-items-center" style="width: 45px; height: 45px;">
                    <i class="fas fa-exclamation-triangle fa-lg"></i>
                </div>
            </div>
        </div>
    </div>

    <div class="row g-4">
        <!-- Collection Trend Chart -->
        <div class="col-lg-8">
            <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
                <div class="card-header border-0 bg-white py-3 border-bottom">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-chart-line me-2 text-danger"></i>Collection Trend (Last 7 Days)</h6>
                </div>
                <div class="card-body p-4 bg-light">
                    <!-- Highcharts/Chart.js container -->
                    <div id="collectionTrendChart" style="height: 300px;"></div>
                </div>
            </div>
        </div>

        <!-- Top Paying Customers -->
        <div class="col-lg-4">
            <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
                <div class="card-header border-0 bg-white py-3 border-bottom">
                    <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-users-cog me-2 text-danger"></i>Top Paying Customers</h6>
                </div>
                <div class="list-group list-group-flush">
                    @forelse($topCustomers as $tc)
                        <div class="list-group-item d-flex align-items-center justify-content-between py-3 border-0 border-bottom">
                            <div>
                                <h6 class="mb-0 fw-bold text-dark">{{ $tc->customer ? $tc->customer->name : 'N/A' }}</h6>
                                <small class="text-muted">{{ $tc->customer ? $tc->customer->user_id : 'N/A' }} ({{ $tc->tx_count }} payments)</small>
                            </div>
                            <span class="badge bg-success rounded-pill px-3 py-2 fw-bold text-white">
                                ৳{{ number_format($tc->total_amount, 2) }}
                            </span>
                        </div>
                    @empty
                        <div class="list-group-item text-center py-4 text-muted">
                            <i class="fas fa-users fa-2x mb-2 d-block"></i> No customer transactions found.
                        </div>
                    @endforelse
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Dynamic Highcharts script -->
<script src="https://code.highcharts.com/highcharts.js" defer></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
    if (typeof Highcharts !== 'undefined') {
        Highcharts.chart('collectionTrendChart', {
            chart: {
                type: 'areaspline',
                backgroundColor: 'transparent'
            },
            title: {
                text: null
            },
            xAxis: {
                categories: {!! json_encode(array_keys($trendData)) !!},
                gridLineWidth: 0,
                lineColor: '#e2e8f0'
            },
            yAxis: {
                title: {
                    text: 'Amount (৳)'
                },
                gridLineColor: '#f1f5f9'
            },
            tooltip: {
                shared: true,
                valuePrefix: '৳'
            },
            credits: {
                enabled: false
            },
            plotOptions: {
                areaspline: {
                    fillOpacity: 0.1,
                    color: '#e11d48',
                    marker: {
                        enabled: true,
                        radius: 4
                    }
                }
            },
            series: [{
                name: 'Daily Collection',
                data: {!! json_encode(array_values($trendData)) !!}
            }]
        });
    }
});
</script>
@endsection
