<?php
namespace App\Core;

use RuntimeException;

final class Crypto
{
    private static function key(): string
    {
        $cfg = $GLOBALS['app_config'] ?? [];
        $raw = (string)($cfg['app_key'] ?? '');
        if (str_starts_with($raw, 'base64:')) $raw = substr($raw, 7);
        $decoded = base64_decode($raw, true);
        if ($decoded === false || strlen($decoded) < 32) {
            throw new RuntimeException('Invalid application encryption key.');
        }
        return substr($decoded, 0, 32);
    }

    public static function encrypt(?string $plain): ?string
    {
        if ($plain === null || $plain === '') return null;
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) throw new RuntimeException('Unable to encrypt credential.');
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $encoded): string
    {
        if (!$encoded) return '';
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 29) return '';
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return $plain === false ? '' : $plain;
    }
}
