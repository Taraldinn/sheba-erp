<?php
class Database {
    private static $instances = [];

    public static function getConnection($host, $db, $user, $pass, $port = 3306) {
        // SAFE: used as internal connection cache identifier, not for security.
        $id = md5("$host:$port:$db:$user"); // Connection identifier
        
        if (!isset(self::$instances[$id])) {
            $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false, // Critical for true prepared statements
                PDO::ATTR_PERSISTENT         => true    // Connection pooling emulation
            ];
            
            try {
                self::$instances[$id] = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                Logger::error("Database Connection Failed: " . $e->getMessage());
                // Mask real DB errors in response
                Response::error('Service currently unavailable due to database connectivity.', 'DB_CONN_ERROR', 500);
            }
        }
        
        return self::$instances[$id];
    }
}
