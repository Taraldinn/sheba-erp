<?php
// scratch/test_matching.php
$host = 'localhost';
$db = 'shebafi_ripa1';
$user = 'shebafi_ripa1';
$pass = 'ripaonline1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    echo "Successfully connected to database: $db\n";

    // 1. Fetch users from DB
    $usersByUserId = [];
    $macMap = [];
    $client_stmt = $pdo->query("SELECT id, user_id, name, onu_mac FROM users");
    while ($row = $client_stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!empty($row['user_id'])) {
            $usersByUserId[strtolower(trim($row['user_id']))] = $row;
        }
        if (!empty($row['onu_mac'])) {
            $cleanMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $row['onu_mac']));
            if ($cleanMac) {
                $macMap[$cleanMac] = $row;
            }
        }
    }
    echo "Total users loaded from DB: " . count($usersByUserId) . "\n";
    echo "Total MACs loaded from DB: " . count($macMap) . "\n";

    // Check user RX0002 in $usersByUserId
    $targetUser = 'rx0002';
    if (isset($usersByUserId[$targetUser])) {
        echo "Found rx0002 in usersByUserId: ";
        print_r($usersByUserId[$targetUser]);
    } else {
        echo "ERROR: rx0002 NOT found in usersByUserId!\n";
    }

    // 2. Load global_online.json
    $cache_file = __DIR__ . '/../cache/global_online.json';
    echo "Cache file path: $cache_file\n";
    if (file_exists($cache_file)) {
        $online_users = json_decode(file_get_contents($cache_file), true);
        if (is_array($online_users)) {
            echo "Loaded online users from cache: " . count($online_users) . "\n";
            
            // Check RX0002 in online cache
            if (isset($online_users['RX0002'])) {
                echo "Found RX0002 in online cache: ";
                print_r($online_users['RX0002']);
            } else {
                echo "RX0002 NOT found in online cache!\n";
            }
            
            // Replicate mapping logic
            foreach ($online_users as $username => $session) {
                $caller_id = $session['caller_id'] ?? '';
                if ($caller_id) {
                    $cleanLiveMac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $caller_id));
                    if ($cleanLiveMac) {
                        $lowerUsername = strtolower(trim($username));
                        if (isset($usersByUserId[$lowerUsername])) {
                            $macMap[$cleanLiveMac] = $usersByUserId[$lowerUsername];
                        }
                    }
                }
            }
        } else {
            echo "ERROR: global_online.json is not an array\n";
        }
    } else {
        echo "ERROR: global_online.json file does not exist!\n";
    }

    // 3. Test matching on clean mac BC62CE0832EC
    $testCleanMac = 'BC62CE0832EC';
    echo "Checking mapping for clean MAC: $testCleanMac\n";
    if (isset($macMap[$testCleanMac])) {
        echo "MATCH SUCCESS!\nMapped User: ";
        print_r($macMap[$testCleanMac]);
    } else {
        echo "MATCH FAILED!\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
