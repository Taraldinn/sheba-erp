<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

// Temporarily expose log in simple way
$host = get_opt($pdo, 'smtp_host');
$port = get_opt($pdo, 'smtp_port');
$user = get_opt($pdo, 'smtp_user');
$pass = get_opt($pdo, 'smtp_pass');
$secure = get_opt($pdo, 'smtp_secure');
$fromName = get_opt($pdo, 'smtp_from_name', 'System');
$fromEmail = get_opt($pdo, 'smtp_from_email');

echo "<h2>SMTP Debugger</h2>";
echo "<strong>Configuration:</strong><br>";
echo "Host: $host<br>";
echo "Port: $port<br>";
echo "User: $user<br>";
echo "Secure: $secure (Auto-fix logic in functions.php applies)<br>";
echo "From: $fromName &lt;$fromEmail&gt;<br><hr>";

// Manual Logic from functions.php to show what's happening
if ($port == 465 && $secure == 'tls') {
    echo "<div style='color:blue'>[INFO] Auto-switching TLS to SSL for Port 465</div>";
    $secure = 'ssl';
}

echo "<h3>Connecting...</h3>";

$smtp = new SimpleSMTP($host, $port, $user, $pass, $secure);

// We need to subclass or use reflection to enable debug output in SimpleSMTP, 
// OR just try to send and print the log log.
// SimpleSMTP has a getLog() method.

$to = $user; // Send to self
$subject = "Debug Test " . time();
$body = "If you get this, it works.";

// Hack to enable debug in SimpleSMTP if it's protected
// SimpleSMTP.php shows `private $debug = false;`
// We can't easily change private property from here without Reflection.
// BUT getLog() returns $this->log array imploded.
// The `read()` method populates `log` array regardless of `$debug` flag?
// Looking at SimpleSMTP.php:
// if ($this->debug) $this->log[] = $response;
// Ah, it ONLY logs response if debug is true!
// So getLog() will be empty unless we modify SimpleSMTP.php or use Reflection to set debug=true.

$reflection = new ReflectionClass($smtp);
$property = $reflection->getProperty('debug');
$property->setAccessible(true);
$property->setValue($smtp, true);

$result = $smtp->send($to, $subject, $body, $fromName, $fromEmail);

if ($result) {
    echo "<h3 style='color:green'>SUCCESS: Email sent.</h3>";
} else {
    echo "<h3 style='color:red'>FAILURE: Email not sent.</h3>";
}

echo "<h3>Transaction Log:</h3>";
echo "<pre style='background:#f0f0f0; padding:10px; border:1px solid #ccc;'>" . htmlspecialchars($smtp->getLog()) . "</pre>";

echo "<hr>";
echo "<h3>PHP Connectivity Test (fsockopen)</h3>";
$target_host = ($secure == 'ssl' ? 'ssl://' : '') . $host;
echo "Attempting raw connection to: $target_host : $port<br>";
$fp = fsockopen($target_host, $port, $errno, $errstr, 10);
if (!$fp) {
    echo "<span style='color:red'>fsockopen Error: $errstr ($errno)</span>";
} else {
    echo "<span style='color:green'>fsockopen Connection Established!</span><br>";
    $server_greeting = fgets($fp, 512);
    echo "Server Greeting: " . htmlspecialchars($server_greeting);
    fclose($fp);
}
?>
