<?php
class Router {
    private $request;
    private $masterDb;
    private $routes = [];

    public function __construct(Request $request, PDO $masterDb) {
        $this->request = $request;
        $this->masterDb = $masterDb;
    }

    public function get($path, $action, $middlewares = []) {
        $this->addRoute('GET', $path, $action, $middlewares);
    }

    public function post($path, $action, $middlewares = []) {
        $this->addRoute('POST', $path, $action, $middlewares);
    }

    private function addRoute($method, $path, $action, $middlewares) {
        // Strip trailing slash if present
        $path = rtrim($path, '/');
        if (empty($path)) $path = '/';
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'action' => $action,
            'middlewares' => $middlewares
        ];
    }

    public function dispatch() {
        $method = $this->request->getMethod();
        $path = $this->request->getPath();
        $path = rtrim($path, '/');
        if (empty($path)) $path = '/';
        Logger::info("Router Dispatch - Method: $method, Path: $path");

        // 1. Find Route
        $matchedRoute = null;
        foreach ($this->routes as $route) {
            if ($route['method'] === $method && $route['path'] === $path) {
                $matchedRoute = $route;
                break;
            }
        }

        if (!$matchedRoute) {
            Response::error('Endpoint not found', 'NOT_FOUND', 404, $this->request->getRequestId());
        }

        $tenantDb = null;
        $tenantData = null;

        // 2. Middleware Pipeline Execution
        if (!empty($matchedRoute['middlewares'])) {
            foreach ($matchedRoute['middlewares'] as $middleware) {
                switch ($middleware) {
                    case 'auth':
                        $tenantData = Auth::authenticate($this->request, $this->masterDb);
                        $this->request->setTenant($tenantData);
                        $tenantDb = Database::getConnection(
                            $_ENV['MASTER_DB_HOST'], // Assuming same host for simplicity
                            $tenantData['db_name'],
                            $tenantData['db_user'],
                            $tenantData['db_pass']
                        );
                        break;
                    case 'customer_tenant':
                        $tenantData = CustomerTenant::resolve($this->request, $this->masterDb);
                        $this->request->setTenant($tenantData);
                        $tenantDb = Database::getConnection(
                            $_ENV['MASTER_DB_HOST'],
                            $tenantData['db_name'],
                            $tenantData['db_user'],
                            $tenantData['db_pass']
                        );
                        break;
                    case 'customer_auth':
                        if (!$tenantData) {
                            $tenantData = CustomerTenant::resolve($this->request, $this->masterDb);
                            $this->request->setTenant($tenantData);
                            $tenantDb = Database::getConnection(
                                $_ENV['MASTER_DB_HOST'],
                                $tenantData['db_name'],
                                $tenantData['db_user'],
                                $tenantData['db_pass']
                            );
                        }
                        $customer = CustomerAuth::authenticate($this->request, $tenantDb);
                        $this->request->setCustomer($customer);
                        break;
                    case 'rate_limit':
                        if ($tenantData) RateLimiter::check($tenantDb, $tenantData['id'], $this->request);
                        break;
                    case 'ip_whitelist':
                        if ($tenantData) IpWhitelist::check($tenantData, $this->request);
                        break;
                    case 'signature':
                        if ($tenantData) SignatureCheck::verify($tenantData, $this->request, $this->masterDb);
                        break;
                }
            }
        }

        // 3. Dispatch to Controller
        list($controllerName, $methodName) = explode('@', $matchedRoute['action']);
        
        if (!class_exists($controllerName) || !method_exists($controllerName, $methodName)) {
            Response::error('Controller mapping error', 'INTERNAL_ERROR', 500, $this->request->getRequestId());
        }

        // Instantiate controller injecting Request & DBs depending on its constructor
        if ($tenantDb) {
            $controller = new $controllerName($this->request, $tenantDb, $this->masterDb);
        } else {
            $controller = new $controllerName($this->request, $this->masterDb); // Usually true for HealthController
        }

        // Execute function
        $controller->$methodName();
    }
}
