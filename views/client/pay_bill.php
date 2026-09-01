<?php require_once __DIR__ . '/layout/header.php'; ?>

<div class="card mb-4">
    <div class="card-header bg-transparent border-bottom py-3">
        <h6 class="mb-0 fw-bold text-dark"><i class="fas fa-credit-card me-2 text-primary"></i> Pay Your Bill</h6>
    </div>
    <div class="card-body py-5 text-center">
        <div class="mb-3">
            <i class="fas fa-money-check-alt fa-3x text-muted opacity-50"></i>
        </div>
        <h5 class="fw-bold">Amount Due: ৳<?= number_format($c['due'] ?? 0, 2) ?></h5>
        <p class="text-muted small">You can pay using our automated gateways.</p>
        
        <div class="d-flex justify-content-center gap-2 mt-4 flex-wrap mb-4">
            <a href="index.php?tab=quick_pay&search_id=<?= urlencode($c['user_id']) ?>" class="btn btn-success px-4 shadow-sm">
                <i class="fas fa-bolt me-1"></i> Pay with bKash / Nagad / SSLCOMMERZ
            </a>
        </div>

        <?php 
            $video_url = get_opt($pdo, 'payment_tutorial_video', '');
            if (!empty($video_url)): 
                $embed_url = $video_url;
                if (strpos($video_url, 'youtube.com') !== false || strpos($video_url, 'youtu.be') !== false) {
                    preg_match('/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i', $video_url, $matches);
                    if (isset($matches[1])) {
                        $embed_url = "https://www.youtube.com/embed/" . $matches[1] . "?autoplay=1&mute=1";
                    }
                } elseif (strpos($video_url, 'drive.google.com') !== false) {
                    $embed_url = str_replace('/view', '/preview', preg_replace('/\?usp=.*/', '', $video_url));
                }
        ?>
        <div class="mt-4 pt-3 border-top">
            <h6 class="fw-bold mb-3 text-muted"><i class="fab fa-youtube text-danger me-1"></i> How to Pay Your Bill</h6>
            <div class="ratio ratio-16x9 mx-auto" style="max-width: 600px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <iframe src="<?= htmlspecialchars($embed_url) ?>" title="Payment Tutorial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
        </div>
        <?php endif; ?>

    </div>
</div>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
