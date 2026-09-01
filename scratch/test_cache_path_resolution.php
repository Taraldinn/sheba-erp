<?php
define('TENANT_OVERRIDE', 'billing');

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
$path_from_functions = get_global_online_cache_path();

require_once __DIR__ . '/../controllers/logic.php';
$path_from_logic = get_global_online_cache_path();

echo "Path from functions: " . $path_from_functions . "\n";
echo "Path from logic:     " . $path_from_logic . "\n";

if ($path_from_functions === $path_from_logic) {
    echo "SUCCESS: Paths are identical.\n";
} else {
    echo "ERROR: Paths are different!\n";
}
