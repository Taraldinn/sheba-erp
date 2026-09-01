<?php
require_once __DIR__ . '/../classes/OLTManager.php';

echo "Instantiating OLTManager with a mock PDO object...\n";

class MockPDO extends PDO {
    public function __construct() {}
    public function query($statement, $mode = PDO::ATTR_DEFAULT_FETCH_MODE, ...$extra_params) {
        echo "PDO::query called with: $statement\n";
        // Mock returning column names for DESCRIBE olts
        if (stripos($statement, 'DESCRIBE olts') !== false) {
            $stmt = new class {
                public function fetchAll($mode = null, ...$args) {
                    return ['id', 'ip', 'brand', 'name', 'enabled', 'onu_cache', 'last_sync'];
                }
            };
            return $stmt;
        }
        return parent::query($statement, $mode, ...$extra_params);
    }
    public function prepare($query, $options = []) {
        echo "PDO::prepare called with: $query\n";
        // Return a mock statement
        return new class {
            public function execute($params = null) {
                echo "PDOStatement::execute called with: " . json_encode($params) . "\n";
                return true;
            }
            public function fetchColumn($column_number = 0) {
                echo "PDOStatement::fetchColumn called\n";
                return 1; // Simulate OLT exists
            }
        };
    }
}

try {
    $mockPdo = new MockPDO();
    $oltManager = new OLTManager($mockPdo);
    echo "Instantiation successful!\n";
} catch (Exception $e) {
    echo "Instantiation failed with: " . $e->getMessage() . "\n";
}
?>
