<?php
$iniPath = 'C:\\xampp\\php\\php.ini';
if (!file_exists($iniPath)) {
    die("php.ini not found at $iniPath\n");
}

$content = file_get_contents($iniPath);
if ($content === false) {
    die("Failed to read php.ini\n");
}

// Check and replace pdo_mysql
$hasPdoMysql = strpos($content, ';extension=pdo_mysql') !== false;
if ($hasPdoMysql) {
    $content = str_replace(';extension=pdo_mysql', 'extension=pdo_mysql', $content);
    echo "Uncommented pdo_mysql\n";
} else {
    echo "pdo_mysql already uncommented or not found as commented\n";
}

// Check and replace curl
$hasCurl = strpos($content, ';extension=curl') !== false;
if ($hasCurl) {
    $content = str_replace(';extension=curl', 'extension=curl', $content);
    echo "Uncommented curl\n";
} else {
    echo "curl already uncommented or not found as commented\n";
}

$result = file_put_contents($iniPath, $content);
if ($result === false) {
    die("Failed to write updated content back to php.ini\n");
}

echo "Successfully updated php.ini\n";
?>
