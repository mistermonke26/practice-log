#!/usr/bin/env bash
# Sets up the scanner as a systemd service so it starts on every boot.
# Run once on the Raspberry Pi: sudo bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_FILE="/etc/systemd/system/practice-scanner.service"

echo "Installing Python dependencies..."
pip3 install -r "$SCRIPT_DIR/requirements.txt"

echo "Writing systemd service to $SERVICE_FILE..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Instrument Practice QR Scanner
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/python3 $SCRIPT_DIR/scanner.py
Restart=on-failure
RestartSec=5
Environment=STATION_INSTRUMENT=piano
Environment=SCAN_COOLDOWN_SECONDS=5
Environment=AUTO_CLOSE_HOURS=4
Environment=MIN_SESSION_MINUTES=1
Environment=CAMERA_INDEX=0

[Install]
WantedBy=multi-user.target
EOF

echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable practice-scanner
systemctl start practice-scanner

echo ""
echo "Done. Check status with:  sudo systemctl status practice-scanner"
echo "View logs with:           journalctl -u practice-scanner -f"
