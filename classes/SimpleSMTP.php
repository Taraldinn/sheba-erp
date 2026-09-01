<?php
class SimpleSMTP {
    private $sock;
    private $host;
    private $port;
    private $user;
    private $pass;
    private $secure; // 'ssl', 'tls', or ''
    private $debug = false;
    private $log = [];

    public function __construct($host, $port, $user, $pass, $secure = '') {
        $this->host = $host;
        $this->port = $port;
        $this->user = $user;
        $this->pass = $pass;
        $this->secure = strtolower($secure);
    }

    public function send($to, $subject, $body, $fromName = 'System', $fromEmail = '') {
        $this->log = [];
        if (!$fromEmail) $fromEmail = $this->user;

        $host = ($this->secure == 'ssl') ? 'ssl://'.$this->host : $this->host;
        $this->sock = fsockopen($host, $this->port, $errno, $errstr, 10);
        
        if (!$this->sock) {
            $this->log[] = "Connection failed: $errstr ($errno)";
            return false;
        }

        $this->read(); // Greeting

        if (!$this->cmd('EHLO '.$_SERVER['SERVER_NAME'])) {
            $this->cmd('HELO '.$_SERVER['SERVER_NAME']);
        }

        if ($this->secure == 'tls') {
            if ($this->cmd('STARTTLS')) {
                if (!stream_socket_enable_crypto($this->sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                     $this->log[] = "TLS negotiation failed";
                     return false;
                }
                $this->cmd('EHLO '.$_SERVER['SERVER_NAME']);
            }
        }

        if ($this->user && $this->pass) {
            if (!$this->cmd('AUTH LOGIN')) return false;
            if (!$this->cmd(base64_encode($this->user))) return false;
            if (!$this->cmd(base64_encode($this->pass))) return false;
        }

        if (!$this->cmd("MAIL FROM: <$fromEmail>")) return false;
        if (!$this->cmd("RCPT TO: <$to>")) return false;
        
        if (!$this->cmd('DATA')) return false;
        
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: $fromName <$fromEmail>\r\n";
        $headers .= "To: <$to>\r\n";
        $headers .= "Subject: $subject\r\n";
        
        $data = $headers . "\r\n" . $body . "\r\n.";
        if (!$this->cmd($data)) return false;
        
        $this->cmd('QUIT');
        fclose($this->sock);
        return true;
    }

    private function cmd($cmd) {
        fputs($this->sock, $cmd . "\r\n");
        $response = $this->read();
        // Check for success codes (2xx, 3xx)
        $code = substr($response, 0, 3);
        return in_array($code, ['220', '250', '334', '235', '354']);
    }

    private function read() {
        $response = '';
        while ($str = fgets($this->sock, 515)) {
            $response .= $str;
            if (substr($str, 3, 1) == ' ') break;
        }
        if ($this->debug) $this->log[] = $response;
        return $response;
    }
    
    public function getLog() {
        return implode("\n", $this->log);
    }
}
