<?php
// Debugging SMTP with verbose output
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/classes/SimpleSMTP.php';
require_once __DIR__ . '/includes/functions.php';

// Override SimpleSMTP for debug
class DebugSimpleSMTP extends SimpleSMTP {
    public function getLog() {
        return parent::getLog();
    }
    // Make log accessible
    public function debug_output() {
        echo "<pre>" . htmlspecialchars($this->getLog()) . "</pre>";
    }
}

$to = 'admin@donet.work.gd'; // Target email (same as sender for test)
$subject = "SMTP Debug Test " . date('Y-m-d H:i:s');
$body = "This is a test email to verify SMTP settings.";

// Get settings
$host = get_opt($pdo, 'smtp_host');
$port = get_opt($pdo, 'smtp_port');
$user = get_opt($pdo, 'smtp_user');
$pass = get_opt($pdo, 'smtp_pass');
$secure = get_opt($pdo, 'smtp_secure');
$fromName = get_opt($pdo, 'smtp_from_name', 'System');
$fromEmail = get_opt($pdo, 'smtp_from_email');

echo "<h3>SMTP Configuration</h3>";
echo "Host: $host<br>";
echo "Port: $port<br>";
echo "User: $user<br>";
echo "Secure: $secure<br>";
echo "From: $fromName <$fromEmail><hr>";

// TEST 1: AS CONFIGURED
echo "<h4>Test 1: As Configured</h4>";
$smtp = new DebugSimpleSMTP($host, $port, $user, $pass, $secure);
// Force debug mode if I could, but SimpleSMTP.php has private $debug = false. 
// I should rely on getLog() which I exposed or check functions.php behavior.
// Actually SimpleSMTP log is private. I need to modify SimpleSMTP to see logs if send returns false.
// But wait, SimpleSMTP.php (Step 13) has `getLog()` public method!
// And `log` property is private but `getLog` returns `implode("\n", $this->log)`.
// So I don't need to subclass effectively if I just use SimpleSMTP.

$smtp = new SimpleSMTP($host, $port, $user, $pass, $secure);
$result = $smtp->send($to, $subject, $body, $fromName, $fromEmail);

if ($result) {
    echo "<div style='color:green'>Test 1 Success! Email sent.</div>";
} else {
    echo "<div style='color:red'>Test 1 Failed.</div>";
    echo "<pre>" . htmlspecialchars($smtp->getLog()) . "</pre>";
}

// TEST 2: FORCE SSL if Port 465
if ($port == 465 && $secure != 'ssl') {
    echo "<hr><h4>Test 2: Force SSL for Port 465</h4>";
    $smtp2 = new SimpleSMTP($host, $port, $user, $pass, 'ssl');
    $result2 = $smtp2->send($to, $subject . " (SSL Forced)", $body, $fromName, $fromEmail);
    
    if ($result2) {
        echo "<div style='color:green'>Test 2 Success! Email sent with Forced SSL.</div>";
        echo "<strong>Recommendation: Change Encryption to 'SSL' in settings or apply code fix.</strong>";
    } else {
        echo "<div style='color:red'>Test 2 Failed.</div>";
        echo "<pre>" . htmlspecialchars($smtp2->getLog()) . "</pre>";
    }
}
?>
