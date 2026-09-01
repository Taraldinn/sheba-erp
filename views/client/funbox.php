<?php require_once __DIR__ . '/layout/header.php'; ?>

    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h4 class="fw-bold text-dark mb-1">Fun Box</h4>
            <p class="text-muted small mb-0">Quick access to entertainment and FTP services.</p>
        </div>
    </div>

    <div class="row g-4">
        <?php 
        $funbox_links = json_decode(get_opt($pdo, 'funbox_links', '[]'), true);
        if (empty($funbox_links)): ?>
            <div class="col-12">
                <div class="card p-5 text-center text-muted">
                    <i class="fas fa-gamepad fa-3x mb-3 text-secondary"></i>
                    <h5>No entertainment links available.</h5>
                </div>
            </div>
        <?php else: foreach($funbox_links as $link): ?>
            <div class="col-6 col-md-4 col-lg-3">
                <a href="<?= htmlspecialchars($link['url']) ?>" target="_blank" class="text-decoration-none">
                    <div class="card border-0 shadow-sm h-100 text-center p-3 animate-hover" style="transition: transform 0.2s;">
                        <div class="bg-primary-subtle rounded-3 p-3 mb-3 mx-auto d-inline-flex align-items-center justify-content-center" style="width: 50px; height: 50px;">
                            <i class="fas fa-play-circle fa-22 text-primary"></i>
                        </div>
                        <h6 class="fw-bold text-dark mb-1"><?= htmlspecialchars($link['name']) ?></h6>
                        <small class="text-muted text-truncate d-block" style="font-size: 0.7rem;"><?= htmlspecialchars($link['url']) ?></small>
                    </div>
                </a>
            </div>
        <?php endforeach; endif; ?>
    </div>

<style>
.animate-hover:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0,0,0,0.06) !important;
}
.bg-primary-subtle {
    background-color: rgba(13, 110, 253, 0.1);
}
</style>

<?php require_once __DIR__ . '/layout/footer.php'; ?>
