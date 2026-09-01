<?php
// includes/db.php
// Loads the correct database configuration based on the detected tenant.

require_once __DIR__ . '/tenant.php';

// Support for CLI/Master Cron override
if (defined('TENANT_OVERRIDE') && strcasecmp(TENANT_OVERRIDE, 'main') !== 0 && TENANT_OVERRIDE !== '') {
    $is_tenant = true;
    $tenant_name = TENANT_OVERRIDE;
} else {
    $is_tenant = defined('CURRENT_TENANT');
    $tenant_name = $is_tenant ? CURRENT_TENANT : null;
}

// Determine Config Path
if ($is_tenant) {
    // Tenant Configuration
    $config_file = __DIR__ . '/tenants/' . $tenant_name . '.php'; // e.g. includes/tenants/client1.php
    
    // Redirect if Missing, BUT Try Recovery First
    if (!file_exists($config_file)) {
        $recovered = false;
        
        // Attempt AUTO-DISCOVERY using Main Config
        $main_config = __DIR__ . '/db_config.php';
        if (file_exists($main_config)) {
            // Load Main Config only specifically for extraction, without side effects
            // We read file content to extract defines manually to avoid loading unexpected constants if they conflict?
            // Actually, we can just include it? But we want to isolate.
            // Let's just include it.
            // However, we are inside 'if ($is_tenant)'. db_config usually defines DB_NAME.
            // We need to capture the Main Credentials.
            
           // Use a closure or safe inclusion if possible, or just regex parse to be safe from defining constants globally yet?
           // Actually, we can just require it, store the creds, and then re-define DB_NAME later? 
           // Constants cannot be redefined.
           // Parsing is safer.
           $content = file_get_contents($main_config);
           if (preg_match("/define\('DB_HOST',\s*'([^']+)'\)/", $content, $m_host) &&
               preg_match("/define\('DB_USER',\s*'([^']+)'\)/", $content, $m_user) &&
               preg_match("/define\('DB_PASS',\s*'([^']*)'\)/", $content, $m_pass)) { // Pass might be empty
               
               $try_host = $m_host[1];
               $try_user = $m_user[1];
               $try_pass = $m_pass[1];
               
               // Candidate Database Names
               $candidates = [
                   $tenant_name,                 // e.g. 'bntc'
                   'radius_' . $tenant_name,     // e.g. 'radius_bntc'
                   'isp_' . $tenant_name,        // e.g. 'isp_bntc'
                   $try_user . '_' . $tenant_name // e.g. 'root_bntc' (cPanel style)
               ];

               foreach ($candidates as $try_db) {
                   try {
                       $test_dsn = "mysql:host=$try_host;dbname=$try_db;charset=utf8";
                       $test_pdo = new PDO($test_dsn, $try_user, $try_pass);
                       // If we are here, connection worked!
                       
                       // RE-CREATE CONFIG FILE
                       $new_config = "<?php\n// Auto-recovered Configuration\ndefine('DB_HOST', '$try_host');\ndefine('DB_NAME', '$try_db');\ndefine('DB_USER', '$try_user');\ndefine('DB_PASS', '$try_pass');\n?>";
                       
                       if (!is_dir(__DIR__ . '/tenants')) mkdir(__DIR__ . '/tenants', 0755, true);
                       file_put_contents($config_file, $new_config);
                       $recovered = true;
                       break; 
                   } catch (Exception $e) {
                       // Continue to next candidate
                   }
               }
           }
        }

        if (!$recovered) {
            if (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg') {
                die("Tenant Configuration Missing for: $tenant_name and could not be auto-discovered.\n");
            }
            // Redirect to Installer specifically for this Tenant
            // Preserve current protocol (http/https)
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['SERVER_PORT'] ?? '') == 443) ? "https://" : "http://";
            $installer_url = $protocol . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "/install/index.php?tenant=" . strtolower($tenant_name);
            
            // Ensure installer exists
            if (file_exists(__DIR__ . '/../install/index.php')) {
                header("Location: " . $installer_url);
                exit;
            } else {
                die("Tenant Configuration Missing and Installer Not Found.");
            }
        }
    }
} else {
    // Main Configuration
    $config_file = __DIR__ . '/db_config.php';
    
    // Redirect if Missing
    if (!file_exists($config_file)) {
         if (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg') {
             die("Main Configuration Missing and could not be loaded.\n");
         }
         // Redirect to Installer (Global)
         // Preserve current protocol (http/https)
         $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['SERVER_PORT'] ?? '') == 443) ? "https://" : "http://";
         $installer_url = $protocol . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "/install/index.php";

        if (file_exists(__DIR__ . '/../install/index.php')) {
            header("Location: " . $installer_url);
            exit;
        } else {
            die("Configuration Missing and Installer Not Found.");
        }
    }
}

// Load Configuration
require_once $config_file;

// Establish Database Connection
try {
    // DB_HOST, DB_NAME, DB_USER, DB_PASS should be defined in the loaded config file
    if (!defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER') || !defined('DB_PASS')) {
         throw new Exception("Incomplete Database Configuration in " . basename($config_file));
    }
    
    $dsn = "mysql:host=" . DB_HOST . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    
    // Attempt database creation if running on main or tenant (installer might have skipped this if using root user)
    // But usually we just connect. 
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Create Tenant DB if not exists (Safety Check)
    // ONLY do this if we are engaged with a high-privilege user? 
    // Usually standard user can't create DB. We skip this and assume installer did it.
    // BUT we must select the DB.

    $pdo->exec("USE `" . DB_NAME . "`");
    
    // Self-healing migration: Ensure send_sms column exists in users table
    try {
        $stmt_col = $pdo->query("SHOW COLUMNS FROM users LIKE 'send_sms'");
        if (!$stmt_col->fetch()) {
            $pdo->exec("ALTER TABLE users ADD COLUMN send_sms TINYINT(1) DEFAULT 1");
        }
    } catch (Exception $migration_ex) {
        // Fail silently
    }
    
} catch (PDOException $e) {
    // Check if error is "Unknown database"
    if ($e->getCode() == 1049) {
        // Database missing -> Redirect to installer to re-create it?
        // Or show error
        die("Database '" . DB_NAME . "' not found. Has it been installed?");
    }
    
    error_log("DB Connection Error ({$tenant_name}): " . $e->getMessage());
    die("Database Connection Error. Please contact support."); 
} catch (Exception $e) {
    die($e->getMessage());
}

// Valid Connection Established
// $pdo is now available globally
?>
