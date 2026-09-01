<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

echo "<h3>OLT Connection Tester</h3>";

// Updated IP from User Screenshot
$ip = '103.164.255.249'; 
$port = 8087;
$url = "http://$ip:$port"; // Base URL

echo "Testing connection to: <strong>$url</strong><br><hr>";

// 1. fsockopen Test (TCP Handshake)
echo "<strong>1. Port Reachability Check (fsockopen):</strong> ";
$fp = @fsockopen($ip, $port, $errno, $errstr, 5);
if (!$fp) {
    echo "<span style='color:red'>FAILED</span> - $errstr ($errno)<br>";
    echo "<small>This means the server cannot reach the OLT IP/Port at all. Check firewall/routing.</small><br>";
} else {
    echo "<span style='color:green'>SUCCESS</span><br>";
    fclose($fp);
}
echo "<hr>";

// 2. cURL Test (HTTP Response)
echo "<strong>2. HTTP Response Check (cURL):</strong> ";
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_VERBOSE, true);

// Create a temp file for debug info
$verbose = fopen('php://temp', 'w+');
curl_setopt($ch, CURLOPT_STDERR, $verbose);

$output = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);

if ($error) {
    echo "<span style='color:red'>FAILED</span> - $error<br>";
} elseif ($http_code >= 200 && $http_code < 400) {
    echo "<span style='color:green'>SUCCESS</span> (HTTP $http_code)<br>";
} else {
    echo "<span style='color:orange'>WARNING</span> (HTTP $http_code)<br>";
}

echo "<br><strong>cURL Verbose Log:</strong><br><pre>";
rewind($verbose);
$verboseLog = stream_get_contents($verbose);
echo htmlspecialchars($verboseLog);
echo "</pre>";

curl_close($ch);
?>
