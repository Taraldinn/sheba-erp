<?php
class SignatureCheck {
    public static function verify($tenantData, Request $request, PDO $masterDb) {
        $body = $request->getRawBody() ?: '';
        $receivedSig = $request->getHeader('X-Signature');
        $timestamp = $request->getHeader('X-Timestamp');

        // Permitted to bypass via environment setting (e.g. for testing)
        if (isset($_ENV['API_SIGNATURE_VERIFICATION']) && $_ENV['API_SIGNATURE_VERIFICATION'] === 'false') {
            return;
        }
        
        if (!$receivedSig || !$timestamp) {
            Response::error('Missing Signature or Timestamp headers', 'MISSING_SIGNATURE', 401, $request->getRequestId());
        }

        // Timestamp window validation (±300 seconds)
        $now = time();
        $diff = abs($now - intval($timestamp));
        if ($diff > 300) {
            Response::error('Request expired. Timestamp outside acceptable window.', 'EXPIRED_TIMESTAMP', 401, $request->getRequestId());
        }

        // HMAC Calculation: HMAC_SHA256(secret, timestamp + '.' + raw_body)
        $message = $timestamp . '.' . $body;
        
        // NEVER expose the secret key in any log or echo!
        $secret = $tenantData['hmac_secret'];
        if (empty($secret)) {
            Response::error('Tenant HMAC Secret is not configured', 'CONFIG_ERROR', 500, $request->getRequestId());
        }

        $calcSig = hash_hmac('sha256', $message, $secret);

        if (!hash_equals($calcSig, $receivedSig)) {
             // Do not expose expected sig in prod
             Logger::audit("Invalid signature attempt. Tenant: " . $tenantData['id']);
             Response::error('Invalid HMAC Signature', 'INVALID_SIGNATURE', 401, $request->getRequestId());
        }

        // Replay prevention (check DB if this timestamp+signature combination was already used)
        // Hash for unique sizing if signature length is too long for the DB column
        $replayHash = hash('sha256', $receivedSig . $timestamp);
        
        $stmt = $masterDb->prepare("SELECT id FROM request_replay WHERE replay_hash = ?");
        $stmt->execute([$replayHash]);
        if ($stmt->fetch()) {
             Logger::audit("Replay attack detected. Tenant: " . $tenantData['id']);
             Response::error('Duplicate request detected (Replay Attack)', 'REPLAY_ATTACK', 429, $request->getRequestId());
        }

        // Clean up old replay tokens (older than 10 minutes (600 seconds)) to keep table small
        // For high capacity, this cleanup should run via cron, not inline here.
        if (rand(1, 10) === 1) { // 10% chance to run cleanup inline for small apps
            try {
                $masterDb->prepare("DELETE FROM request_replay WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)")->execute();
            } catch (Exception $e) { }
        }

        // Log to prevent replay
        try {
            $masterDb->prepare("INSERT INTO request_replay (tenant_id, replay_hash, created_at) VALUES (?, ?, NOW())")->execute([$tenantData['id'], $replayHash]);
        } catch (PDOException $e) {
             // Primary key violation also means duplicate!
             Logger::audit("Replay attack detected via constraint violation. Tenant: " . $tenantData['id']);
             Response::error('Duplicate request detected', 'REPLAY_ATTACK', 429, $request->getRequestId());
        }
    }
}
