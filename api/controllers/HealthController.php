<?php
class HealthController {
    private $request;
    private $masterDb;

    public function __construct(Request $request, PDO $masterDb) {
        $this->request = $request;
        $this->masterDb = $masterDb;
    }

    public function check() {
        $stmt = $this->masterDb->prepare("SELECT * FROM api_tokens ORDER BY id DESC LIMIT 1");
        $stmt->execute();
        $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

        $health = [
            'app_status' => 'OK',
            'db_master' => 'OK',
            'time' => date('Y-m-d H:i:s'),
            'env' => $_ENV['APP_ENV'] ?? 'unknown',
            'debug_token' => $tokenRow
        ];

        try {
            $this->masterDb->query('SELECT 1');
        } catch (Exception $e) {
            $health['db_master'] = 'FAILED';
            Response::error('Database disconnected', 'INTERNAL_ERROR', 500, $this->request->getRequestId());
        }

        Response::success($health, 200, $this->request->getRequestId());
    }

    public function debugHeaders() {
        $stmt = $this->masterDb->prepare("SELECT * FROM api_tokens ORDER BY id DESC LIMIT 1");
        $stmt->execute();
        $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

        $data = [
            'token' => $tokenRow,
        ];
        header('Cache-Control: no-cache, must-revalidate');
        header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
        Response::success($data, 200, $this->request->getRequestId());
    }
    public function diag() {
        $tenants = $this->masterDb->query("SELECT id, name, subdomain, status FROM tenants")->fetchAll();
        foreach ($tenants as &$tenant) {
            $stmt = $this->masterDb->prepare("SELECT COUNT(*) as token_count FROM api_tokens WHERE tenant_id = ?");
            $stmt->execute([$tenant['id']]);
            $tenant['token_count'] = $stmt->fetch(PDO::FETCH_ASSOC)['token_count'];
        }
        $data = [
            'tenants' => $tenants,
            'host' => $_SERVER['HTTP_HOST'] ?? 'unknown',
            'subdomain' => (new Request())->getSubdomain()
        ];
        Response::success($data, 200, $this->request->getRequestId());
    }
}
