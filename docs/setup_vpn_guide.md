# Linux VPS Setup Guide for Multi-Tenant PPTP VPN Manager

This guide details the step-by-step procedure to deploy, secure, and run the PPTP VPN integration module on your Linux Singapore VPS (Ubuntu/CentOS).

---

## 1. Install Linux PPTP Client Dependencies

The VPN manager requires standard Linux PPTP client binaries (`pppd`, `pptp`, `pon`, and `poff`).

### Ubuntu / Debian:
```bash
sudo apt update
sudo apt install -y pptp-linux ppp
```

### CentOS / RHEL:
```bash
sudo yum install -y epel-release
sudo yum install -y pptp ppp
```

---

## 2. Configure Secure Sudoers Permissions

By default, network commands (`pon`, `poff`, `ip route`) require root privileges. Since your PHP application or cron jobs will run as a non-root user (e.g. `www-data` or a dedicated system user), we must allow secure, password-less privilege escalation exclusively for these commands.

1. Create a dedicated sudoers file:
   ```bash
   sudo visudo -f /etc/sudoers.d/shebafi-vpn
   ```

2. Add the following line (replace `shebafi` with your specific web/worker system user if different):
   ```text
   shebafi ALL=(ALL) NOPASSWD: /usr/sbin/pppd call *, /usr/bin/pkill -f *, /bin/pkill -f *, /sbin/ip route *, /sbin/ip link *, /usr/bin/tee /etc/ppp/peers/shebafi_vpn_*, /bin/tee /etc/ppp/peers/shebafi_vpn_*, /usr/bin/rm -f /etc/ppp/peers/shebafi_vpn_*, /bin/rm -f /etc/ppp/peers/shebafi_vpn_*, /usr/bin/chmod 600 /etc/ppp/peers/shebafi_vpn_*, /bin/chmod 600 /etc/ppp/peers/shebafi_vpn_*
   ```

   > [!NOTE]
   > To verify the exact paths of these commands on your VPS, run:
   > `which pppd pkill ip`

3. Save and close. The system will automatically apply these secure rules.

---

## 3. Database Initial Setup & Configuration Seeding

The database migration inside `includes/config.php` automatically creates the `tenant_vpn` table in each tenant database upon their first request.

To seed a connection manually inside a tenant's database, run this SQL insert:

```sql
INSERT INTO tenant_vpn (
    tenant_id, 
    pptp_server, 
    pptp_username, 
    pptp_password, 
    olt_lan, 
    vpn_status
) VALUES (
    'tenant_a',               -- Your tenant/subdomain name
    '103.204.x.x',            -- IP address of the tenant's remote router
    'vpn_user_tenant_a',      -- PPTP Username
    'secure_password_123',    -- PPTP Password
    '192.168.1.0/24',         -- LAN subnet where Bangladeshi OLTs are hosted
    'disconnected'            -- Default starting status (worker will auto-connect)
);
```

To temporarily disable a VPN connection, you can toggle its database state:
- To disable: `UPDATE tenant_vpn SET vpn_status = 'disabled' WHERE id = 1;` (Worker will auto-disconnect and tear down routes).
- To re-enable: `UPDATE tenant_vpn SET vpn_status = 'disconnected' WHERE id = 1;` (Worker will auto-connect and restore routes).

---

## 4. Run the Background Daemon (Recommended)

Running the worker as a persistent background daemon ensures sub-second responsiveness, instant auto-reconnections, and constant OLT telemetry monitoring.

### Setup systemd Service
1. Create a new systemd unit file:
   ```bash
   sudo nano /etc/systemd/system/shebafi-vpn.service
   ```

2. Paste the following configuration (replace `/var/www/html/` with your exact project root directory path, and ensure the user matches your web/worker user):
   ```ini
   [Unit]
   Description=ShebaFI Multi-Tenant VPN Daemon Worker
   After=network.target mysql.service
   
   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/html
   ExecStart=/usr/bin/php cron/master_vpn_worker.php --daemon --interval=10
   Restart=always
   RestartSec=5
   StandardOutput=syslog
   StandardError=syslog
   SyslogIdentifier=shebafi-vpn
   
   [Install]
   WantedBy=multi-user.target
   ```

3. Reload systemd, enable the service on boot, and start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable shebafi-vpn.service
   sudo systemctl start shebafi-vpn.service
   ```

4. Monitor live daemon activity:
   ```bash
   sudo systemctl status shebafi-vpn.service
   # View live logs
   sudo journalctl -u shebafi-vpn.service -f
   ```

---

## 5. Cron Job Option (Alternative to Daemon)

If you prefer standard periodic cron executions instead of a persistent daemon, you can register the master worker in your crontab.

1. Open your cron configurations:
   ```bash
   crontab -e
   ```

2. Add the following rule to check and repair all VPN tunnels and routes once every minute:
   ```text
   * * * * * /usr/bin/php /var/www/html/cron/master_vpn_worker.php >> /var/www/html/logs/cron_vpn_master.log 2>&1
   ```

---

## 6. Diagnostic & Troubleshooting Commands

If a tenant's OLT is showing offline, use these terminal commands on the VPS to diagnose:

- **Check active PPP interface links:**
  ```bash
  ip link show
  ```
  Look for `ppp1`, `ppp2`, etc.

- **Check IP bindings on PPP interfaces:**
  ```bash
  ip addr show dev ppp1
  ```

- **Verify global routing table rules:**
  ```bash
  ip route show
  ```
  You should see rules such as `192.168.1.0/24 dev ppp1 proto kernel scope link src 10.10.10.2` or similar, showing that traffic to the OLT LAN is explicitly bound to the PPP interface.

- **Debug the raw PPTP negotiation handshake:**
  If a connection fails to establish, check the syslog/kernel logs:
  ```bash
  sudo tail -n 100 /var/log/syslog | grep pppd
  ```
  This will reveal authentication failures, cipher mismatches (e.g. MPPE missing), or server timeout issues.

- **View VPN manager custom log entries:**
  ```bash
  tail -f logs/vpn_manager.log
  ```
