<?php
class ExceptionHandler {
    public static function handle($exception) {
        Logger::error("Uncaught Exception: " . $exception->getMessage() . " in " . $exception->getFile() . " on line " . $exception->getLine());
        
        $env = $_ENV['APP_ENV'] ?? 'production';
        if ($env === 'development') {
            Response::error($exception->getMessage() . "\n" . $exception->getTraceAsString(), 'FATAL_ERROR', 500);
        } else {
            Response::error('An unexpected internal server error occurred', 'INTERNAL_ERROR', 500);
        }
    }

    public static function handleError($level, $message, $file, $line) {
        if (error_reporting() & $level) {
            throw new ErrorException($message, 0, $level, $file, $line);
        }
        return false; // let default handler run if skipped
    }
}
