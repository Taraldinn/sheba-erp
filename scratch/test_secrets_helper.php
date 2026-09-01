<?php
/**
 * scratch/test_secrets_helper.php
 * Verifies that the regex and parsing logic for ppp secrets is robust.
 */

function mock_update_ppp_secrets($mock_content, $username, $password, $remove = false) {
    $lines = explode("\n", $mock_content);
    $new_lines = [];
    
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if (empty($trimmed)) {
            $new_lines[] = $line;
            continue;
        }
        
        // Match line starting with this username (quoted or unquoted, followed by whitespace)
        // Format: "ashik" * "pass" * OR ashik * pass *
        $pattern = '/^\s*"?'.preg_quote($username, '/').'"?\s+/i';
        if (preg_match($pattern, $trimmed)) {
            continue; // Filter/remove
        }
        $new_lines[] = $line;
    }
    
    if (!$remove && !empty($password)) {
        $new_lines[] = sprintf('"%s" * "%s" *', addcslashes($username, '"\\'), addcslashes($password, '"\\'));
    }
    
    return implode("\n", $new_lines);
}

// --- RUN TESTS ---
echo "=== Running PPP Secrets Parser Mock Tests ===\n\n";

$mock_file = <<<EOD
# Mock chap-secrets file
"other_tenant" * "other_pass" *
ashik * old_pass *
  "ashik"   pptp   "another_old_pass" *
"tenant_b" * "pass_b" *
EOD;

echo "--- Initial Secrets File ---\n";
echo $mock_file . "\n";
echo "----------------------------\n\n";

// Test 1: Update existing username
echo "Test 1: Updating 'ashik' with password 'new_secure_pass_123'\n";
$res1 = mock_update_ppp_secrets($mock_file, 'ashik', 'new_secure_pass_123');
echo "Result:\n" . $res1 . "\n";
echo "----------------------------\n\n";

// Test 2: Add completely new user
echo "Test 2: Adding new user 'new_tenant_x' with password 'temp_pass'\n";
$res2 = mock_update_ppp_secrets($res1, 'new_tenant_x', 'temp_pass');
echo "Result:\n" . $res2 . "\n";
echo "----------------------------\n\n";

// Test 3: Remove user
echo "Test 3: Removing user 'ashik'\n";
$res3 = mock_update_ppp_secrets($res2, 'ashik', '', true);
echo "Result:\n" . $res3 . "\n";
echo "----------------------------\n\n";

// Test 4: Special characters handling
echo "Test 4: Special characters in password 'pass\"with\\\\slashes'\n";
$res4 = mock_update_ppp_secrets($res3, 'special_user', 'pass"with\\slashes');
echo "Result:\n" . $res4 . "\n";
echo "----------------------------\n\n";

echo "=== All Tests Completed ===\n";
EOD;
?>
