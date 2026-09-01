            </div> <!-- end main-content -->
            <footer class="text-center py-3 bg-white border-top mt-auto">
                <small class="text-muted">&copy; <?= date('Y') ?> Swim Domain. All Rights Reserved.</small>
            </footer>
        </div> <!-- end main-wrapper -->
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    <script>
        document.getElementById('sidebarToggle')?.addEventListener('click', function() {
            document.getElementById('mainSidebar').classList.add('mobile-show');
            document.getElementById('sidebarOverlay').classList.add('show');
        });
        
        document.getElementById('sidebarOverlay')?.addEventListener('click', function() {
            document.getElementById('mainSidebar').classList.remove('mobile-show');
            document.getElementById('sidebarOverlay').classList.remove('show');
        });
    </script>
<?php
if (isLoggedIn() && hasRole('Admin') && isset($tab) && ($tab === 'dashboard' || $tab === '')) {
    $client_name = get_opt($pdo, 'client_name', '');
    $client_dob = get_opt($pdo, 'client_date_of_birth', '');
    if (!empty($client_name) && !empty($client_dob)) {
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $client_dob)) {
            $dob_parts = explode('-', $client_dob);
            $dob_month = $dob_parts[1];
            $dob_day = $dob_parts[2];
            
            $tz = new DateTimeZone('Asia/Dhaka');
            $today = new DateTime('now', $tz);
            $today_month = $today->format('m');
            $today_day = $today->format('d');
            $today_year = $today->format('Y');
            
            if ($dob_month === $today_month && $dob_day === $today_day) {
                $today_str = $today->format('Y-m-d');
                
                // Retrieve show history from database to persist across sessions/devices
                $last_shown_time = (int)get_opt($pdo, 'birthday_popup_last_shown_time', '0');
                $shown_date = get_opt($pdo, 'birthday_popup_shown_date', '');
                $shown_count = (int)get_opt($pdo, 'birthday_popup_shown_count', '0');
                
                if ($shown_date !== $today_str) {
                    $shown_count = 0;
                }
                
                $time_diff = time() - $last_shown_time;
                
                // Show if count is less than 3, and (it hasn't been shown today OR 5 hours [18000s] have passed since last show)
                if ($shown_count < 3 && ($shown_count == 0 || $time_diff >= 18000)) {
                    // Update database settings immediately to lock further triggers for the next 5 hours
                    set_opt($pdo, 'birthday_popup_last_shown_time', time());
                    set_opt($pdo, 'birthday_popup_shown_date', $today_str);
                    set_opt($pdo, 'birthday_popup_shown_count', $shown_count + 1);
                    
                    // Escape output to prevent XSS
                    $safe_client_name = htmlspecialchars($client_name, ENT_QUOTES, 'UTF-8');
                    ?>
                    <!-- Happy Birthday Modal -->
                    <style>
                    @keyframes floatLeft {
                        0% { transform: translateY(0) rotate(-10deg); }
                        100% { transform: translateY(-15px) rotate(-5deg); }
                    }
                    @keyframes floatRight {
                        0% { transform: translateY(0) rotate(12deg); }
                        100% { transform: translateY(-18px) rotate(18deg); }
                    }
                    .text-gradient {
                        background: linear-gradient(45deg, #f72585, #7209b7);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }
                    </style>
                    <div class="modal fade" id="birthdayModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
                        <div class="modal-dialog modal-dialog-centered" style="max-width: 550px;">
                            <div class="modal-content overflow-hidden border-0 shadow-lg position-relative" style="border-radius: 20px; background: linear-gradient(135deg, #ffffff 0%, #f7f9fc 100%);">
                                <!-- Decorative Balloons -->
                                <div class="balloon-container position-absolute w-100 h-100" style="pointer-events: none; top: 0; left: 0; z-index: 1;">
                                    <!-- Left Balloon -->
                                    <div class="balloon-left position-absolute" style="left: 20px; top: 30px; width: 45px; height: 55px; background: #ff7096; border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%; transform: rotate(-10deg); filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); animation: floatLeft 3s ease-in-out infinite alternate;">
                                        <div style="position: absolute; bottom: -8px; left: 21px; width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-bottom: 8px solid #ff7096;"></div>
                                        <div style="position: absolute; bottom: -28px; left: 23px; width: 1px; height: 20px; background: rgba(0,0,0,0.15); transform: skewX(-5deg);"></div>
                                    </div>
                                    <!-- Right Balloon -->
                                    <div class="balloon-right position-absolute" style="right: 20px; top: 45px; width: 40px; height: 50px; background: #4cc9f0; border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%; transform: rotate(12deg); filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); animation: floatRight 3.5s ease-in-out infinite alternate;">
                                        <div style="position: absolute; bottom: -8px; left: 18px; width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-bottom: 8px solid #4cc9f0;"></div>
                                        <div style="position: absolute; bottom: -28px; left: 20px; width: 1px; height: 20px; background: rgba(0,0,0,0.15); transform: skewX(5deg);"></div>
                                    </div>
                                </div>

                                <!-- Close Button -->
                                <button type="button" class="btn-close position-absolute" data-bs-dismiss="modal" aria-label="Close" style="top: 20px; right: 20px; z-index: 10;"></button>

                                <!-- Modal Content Body -->
                                <div class="modal-body text-center p-5" style="z-index: 2; position: relative;">
                                    <!-- Confetti Canvas -->
                                    <canvas id="birthday-confetti" class="position-absolute top-0 start-0 w-100 h-100" style="pointer-events: none; z-index: 100;"></canvas>

                                    <!-- Header Banner -->
                                    <div class="text-uppercase tracking-wider fw-bold text-gradient mb-2" style="font-size: 0.9rem; letter-spacing: 2px;">🎉 Happy Birthday 🎉</div>
                                    
                                    <!-- SVG Cake -->
                                    <svg viewBox="0 0 200 200" width="130" height="130" class="mx-auto my-3 d-block" style="z-index: 5; position: relative;">
                                      <!-- Cake Base/Stand -->
                                      <rect x="25" y="170" width="150" height="10" rx="5" fill="#e0e0e0" />
                                      <path d="M75,170 L85,190 L115,190 L125,170 Z" fill="#d0d0d0" />
                                      
                                      <!-- Tier 1 (Bottom Cake) -->
                                      <rect x="40" y="110" width="120" height="60" rx="8" fill="#ff7096" />
                                      <!-- Bottom Frosting Waves -->
                                      <path d="M40,130 C50,140 60,120 70,130 C80,140 90,120 100,130 C110,140 120,120 130,130 C140,140 150,120 160,130 L160,110 L40,110 Z" fill="#ff85a1" opacity="0.8" />
                                      
                                      <!-- Tier 2 (Top Cake) -->
                                      <rect x="60" y="65" width="80" height="45" rx="6" fill="#fbc3bc" />
                                      <!-- Top Frosting Waves -->
                                      <path d="M60,80 C70,88 80,75 90,80 C100,88 110,75 120,80 C130,88 140,75 140,80 L140,65 L60,65 Z" fill="#f8ad9d" opacity="0.8" />
                                      
                                      <!-- Sprinkles on Cakes -->
                                      <circle cx="55" cy="150" r="2.5" fill="#fceade" />
                                      <circle cx="85" cy="140" r="2.5" fill="#38b000" />
                                      <circle cx="115" cy="150" r="2.5" fill="#48cae4" />
                                      <circle cx="145" cy="140" r="2.5" fill="#fceade" />
                                      <circle cx="75" cy="95" r="2" fill="#38b000" />
                                      <circle cx="100" cy="90" r="2" fill="#ff7096" />
                                      <circle cx="125" cy="95" r="2" fill="#48cae4" />
                                      
                                      <!-- Candles -->
                                      <!-- Candle Left -->
                                      <rect x="75" y="40" width="6" height="25" rx="2" fill="#4cc9f0" />
                                      <path d="M78,40 C76,33 80,30 78,25 C80,30 80,33 78,40 Z" fill="#f77f00" />
                                      <circle cx="78" cy="27" r="4" fill="#fcbf49" opacity="0.6" />
                                      
                                      <!-- Candle Middle -->
                                      <rect x="97" y="35" width="6" height="30" rx="2" fill="#ffb703" />
                                      <path d="M100,35 C98,28 102,25 100,20 C102,25 102,28 100,35 Z" fill="#f77f00" />
                                      <circle cx="100" cy="22" r="4" fill="#fcbf49" opacity="0.6" />
                                      
                                      <!-- Candle Right -->
                                      <rect x="119" y="40" width="6" height="25" rx="2" fill="#b5179e" />
                                      <path d="M122,40 C120,33 124,30 122,25 C124,30 124,33 122,40 Z" fill="#f77f00" />
                                      <circle cx="122" cy="27" r="4" fill="#fcbf49" opacity="0.6" />
                                    </svg>
                                    
                                    <!-- Headings -->
                                    <h3 class="fw-bold mt-3 text-dark">Happy Birthday to You! 🎉</h3>
                                    <h1 class="display-6 fw-extrabold text-primary my-3 text-uppercase" style="letter-spacing: -0.5px; font-weight: 800; word-break: break-word;"><?= $safe_client_name ?></h1>
                                    
                                    <p class="text-muted px-3" style="font-size: 1.05rem; line-height: 1.6;">Wishing you a wonderful birthday filled with happiness, success and many great moments.</p>
                                    
                                    <div class="mt-4">
                                        <button type="button" class="btn btn-primary px-5 py-2.5 fw-bold shadow border-0" data-bs-dismiss="modal" style="border-radius: 50px; background: linear-gradient(135deg, #4cc9f0 0%, #7209b7 100%);">
                                            Thank You ❤️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    document.addEventListener('DOMContentLoaded', function() {
                        // Delay 750ms after dashboard load
                        setTimeout(function() {
                            const bdayModal = new bootstrap.Modal(document.getElementById('birthdayModal'));
                            bdayModal.show();
                            startConfetti();
                        }, 750);

                        function startConfetti() {
                            const canvas = document.getElementById('birthday-confetti');
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            
                            // Adjust size to modal card area
                            canvas.width = canvas.parentElement.clientWidth;
                            canvas.height = canvas.parentElement.clientHeight;
                            
                            const colors = ['#ff007f', '#7209b7', '#3f37c9', '#4cc9f0', '#f72585', '#4895ef', '#f3c68f'];
                            const confettiCount = 80;
                            const confetti = [];
                            
                            for (let i = 0; i < confettiCount; i++) {
                                confetti.push({
                                    x: Math.random() * canvas.width,
                                    y: Math.random() * canvas.height - canvas.height,
                                    size: Math.random() * 6 + 4,
                                    color: colors[Math.floor(Math.random() * colors.length)],
                                    speed: Math.random() * 3 + 1.5,
                                    angle: Math.random() * 360,
                                    rotation: Math.random() * 4 - 2
                                });
                            }
                            
                            let active = true;
                            let timeout = setTimeout(() => {
                                active = false;
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                            }, 5000); // stop after 5s
                            
                            function draw() {
                                if (!active) return;
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                
                                confetti.forEach((p) => {
                                    p.y += p.speed;
                                    p.angle += p.rotation;
                                    
                                    if (p.y > canvas.height) {
                                        p.y = -10;
                                        p.x = Math.random() * canvas.width;
                                    }
                                    
                                    ctx.save();
                                    ctx.translate(p.x + p.size/2, p.y + p.size/2);
                                    ctx.rotate(p.angle * Math.PI / 180);
                                    ctx.fillStyle = p.color;
                                    ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                                    ctx.restore();
                                });
                                
                                requestAnimationFrame(draw);
                            }
                            
                            draw();
                            
                            document.getElementById('birthdayModal').addEventListener('hidden.bs.modal', function () {
                                active = false;
                                clearTimeout(timeout);
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                            });
                        }
                    });
                    </script>
                    <?php
                }
            }
        }
    }
}
?>
<script>
// Non-blocking background execution of Voice Reminders and Results Sync
(function() {
    const now = Date.now();
    const lastTrigger = localStorage.getItem('last_voice_trigger_time');
    
    // Cooldown of 5 minutes (300,000 milliseconds)
    if (!lastTrigger || (now - parseInt(lastTrigger)) > 300000) {
        localStorage.setItem('last_voice_trigger_time', now);
        
        // Detect current tenant from URL or session configuration
        const urlParams = new URLSearchParams(window.location.search);
        const tenant = urlParams.get('tenant') || '';
        const tenantQuery = tenant ? '?tenant=' + encodeURIComponent(tenant) : '';
        
        // Execute background fetch requests without blocking UI
        setTimeout(() => {
            fetch('cron/voice_reminders.php' + tenantQuery, { method: 'GET', cache: 'no-store', priority: 'low' }).catch(err => {});
            fetch('cron/voice_broadcast_results.php' + tenantQuery, { method: 'GET', cache: 'no-store', priority: 'low' }).catch(err => {});
        }, 1500); // Wait 1.5 seconds after page load to ensure browser UI is fully responsive
    }
})();
</script>
</body>
</html>

