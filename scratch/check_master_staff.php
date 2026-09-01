<?php
try {
    $p = new PDO("mysql:host=127.0.0.1;dbname=shebafi_master;charset=utf8", "root", "");
    $res = $p->query("SELECT id, username, role FROM staff WHERE username LIKE '%ripa%'")->fetchAll(PDO::FETCH_ASSOC);
    echo "Master staff records:\n";
    print_r($res);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
