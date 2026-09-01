<?php
try {
    $p = new PDO("mysql:host=127.0.0.1;dbname=shebafi_ripa1;charset=utf8", 'root', '');
    $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $rows = $p->query("SELECT id, username, role, permissions FROM staff WHERE username LIKE '%ripaonline%'")->fetchAll(PDO::FETCH_ASSOC);
    echo "Staff records matching ripaonline:\n";
    print_r($rows);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
