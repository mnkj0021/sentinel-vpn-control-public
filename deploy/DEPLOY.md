# Sentinel Deploy Cheatsheet (Phase 2, hardened)

Domain: **iamnadir.com** (API at api.iamnadir.com, marketing at iamnadir.com, optional dashboard at dashboard.iamnadir.com).

## 0) Prereqs (Ubuntu/Debian VPS with WireGuard)
```bash
sudo apt-get update
sudo apt-get install -y wireguard nodejs npm nginx certbot python3-certbot-nginx git
```

## 1) Clone + build
```bash
sudo mkdir -p /opt/sentinel && cd /opt/sentinel
sudo git clone <your-repo-url> sentinel-repo
cd sentinel-repo/sentinel-vpn-control/backend
sudo npm install
sudo npm run build
```

## 2) Systemd service
Edit `deploy/sentinel-backend.service` if you want to change the prefilled API key (currently set to `7f5c0d6f9e014f4d8f3c6a2b71c94fcb6c2a0f6c4c1d4e1f9b2c7d8a5e0f9b3`) or domains, then:
```bash
sudo cp deploy/sentinel-backend.service /etc/systemd/system/sentinel-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now sentinel-backend
sudo systemctl status sentinel-backend
```
Generate an API key:
```bash
openssl rand -hex 32
```

## 3) Marketing site
```bash
sudo mkdir -p /var/www/sentinel-marketing
sudo cp /opt/sentinel/sentinel-repo/sentinel-vpn-control/marketing/index.html /var/www/sentinel-marketing/index.html
```

## 4) Dashboard build (optional to host on VPS)
```bash
cd /opt/sentinel/sentinel-repo/sentinel-vpn-control
VITE_API_BASE=https://api.iamnadir.com npm install
VITE_API_BASE=https://api.iamnadir.com npm run build
sudo mkdir -p /var/www/sentinel-dashboard
sudo cp -r dist/* /var/www/sentinel-dashboard/
```
Add another nginx server block for `dashboard.example.com` if hosting here; otherwise run `npm run dev` locally.

## 5) Nginx (TLS + proxy)
Edit `deploy/nginx-sentinel.conf` with your domains and copy:
```bash
sudo cp deploy/nginx-sentinel.conf /etc/nginx/sites-available/sentinel
sudo ln -s /etc/nginx/sites-available/sentinel /etc/nginx/sites-enabled/sentinel
sudo nginx -t && sudo systemctl reload nginx
```
Issue certs:
```bash
sudo mkdir -p /var/www/certbot
sudo certbot --nginx -d api.iamnadir.com -d iamnadir.com -d www.iamnadir.com
sudo systemctl reload nginx
```

## 6) Firewall (ufw)
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 7) Verify
```bash
curl -H "x-sentinel-key: <api-key>" https://api.iamnadir.com/api/health
curl -H "x-sentinel-key: <api-key>" https://api.iamnadir.com/api/devices
```
