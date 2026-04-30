# Instrument Practice Tracker

A wall-mounted QR scanner that logs practice sessions automatically.
Each person has one printed QR card. Scan to start, scan again to end.
Everything runs locally on a Raspberry Pi — no internet, no apps, no typing.

---

## Project Structure

```
capstone/
├── prd.md                     product requirements
├── README.md                  this file
├── tracker.db                 SQLite database (created on first run)
│
├── pi-scanner/
│   ├── scanner.py             main entry point — runs the camera loop
│   ├── session.py             session toggle logic + auto-close
│   ├── db.py                  database helpers + schema
│   ├── config.py              all tuneable settings
│   ├── requirements.txt       Python dependencies
│   └── setup.sh               installs scanner as a systemd service
│
├── dashboard/
│   ├── app.py                 Flask web dashboard
│   └── templates/
│       ├── base.html
│       ├── index.html         today + weekly summary + flagged sessions
│       ├── edit.html          edit or delete a session
│       ├── add.html           manually add a missed session
│       └── day.html           browse past dates
│
└── qr-cards/
    ├── generate.py            generates printable QR card PNGs
    ├── users.json             list of users and their instruments
    └── cards/                 generated card images (created on first run)
```

---

## Quick Start

### 1. Install dependencies

```bash
cd capstone/pi-scanner
pip3 install -r requirements.txt
```

If OpenCV struggles to read QR codes reliably, uncomment the `pyzbar` lines in
`requirements.txt` and also run:

```bash
sudo apt install libzbar0
```

### 2. Configure the station

Open `pi-scanner/config.py` and set `STATION_INSTRUMENT` to the name of the
instrument at this wall station. Everything else works with the defaults.

Or set environment variables instead:

```bash
export STATION_INSTRUMENT=guitar
export SCAN_COOLDOWN_SECONDS=5
export AUTO_CLOSE_HOURS=4
```

### 3. Generate QR cards

Edit `qr-cards/users.json` to list your household members and their instruments:

```json
[
  { "name": "Jasmin", "instrument": "piano" },
  { "name": "Alex",   "instrument": "piano" }
]
```

Then run:

```bash
cd capstone/qr-cards
python3 generate.py
```

Print the PNGs from `cards/` at 300 DPI, approximately 5cm × 6.5cm.
Laminate them so they survive daily handling.

### 4. Run the scanner

```bash
cd capstone/pi-scanner
python3 scanner.py
```

Point your camera at a QR card to test. You should see log output like:

```
[▶ START] jasmin started piano
[■ END  ] jasmin ended piano — 32.0 min
```

### 5. Run the dashboard

In a separate terminal (or as a second systemd service):

```bash
cd capstone/dashboard
python3 app.py
```

Open `http://<your-pi-ip>:5000` on any device connected to the same network.

### 6. Auto-start on boot (Raspberry Pi)

```bash
cd capstone/pi-scanner
sudo bash setup.sh
```

This registers the scanner as a systemd service that starts automatically.
To also auto-start the dashboard, duplicate the service file and point it at
`dashboard/app.py`.

---

## How Sessions Work

| Scan | Result |
|---|---|
| First scan of your card | Session starts, time recorded |
| Second scan of the same card | Session ends, duration saved |
| Same card within cooldown window | Ignored — prevents accidental double-tap |
| Session open > 4 hours | Auto-closed overnight, marked `auto_closed` |
| Session ends in < 1 minute | Saved but flagged `suspicious` |

---

## Dashboard Features

- **Today view** — all sessions today, open sessions, flagged sessions
- **Weekly totals** — minutes per person per instrument
- **Edit session** — fix start/end times, add notes
- **Delete session** — remove accidental or test logs
- **Add session** — manually enter a missed session

---

## Tuning

All settings are in `pi-scanner/config.py`:

| Setting | Default | Description |
|---|---|---|
| `STATION_INSTRUMENT` | `"piano"` | Instrument at this station |
| `SCAN_COOLDOWN_SECONDS` | `5` | Ignore same QR for N seconds after scan |
| `AUTO_CLOSE_HOURS` | `4` | Auto-close abandoned sessions after N hours |
| `MIN_SESSION_MINUTES` | `1` | Flag sessions shorter than N minutes |
| `CAMERA_INDEX` | `0` | OpenCV camera device index |
| `CAMERA_FPS` | `10` | Capture rate for the scan loop |

---

## Troubleshooting

**Camera not found**
Run `ls /dev/video*` to find your camera device index and set `CAMERA_INDEX` accordingly.

**QR codes not detected**
- Print codes larger (at least 5cm × 5cm)
- Improve lighting above the scan zone
- Avoid glossy or reflective card surfaces
- If still unreliable, uncomment `pyzbar` in `requirements.txt`

**Pi camera (CSI) not working with OpenCV**
Use `Picamera2` instead. A Picamera2-compatible scanner variant is on the roadmap.

**Dashboard not reachable from other devices**
Make sure port 5000 is not blocked by a firewall on the Pi:
```bash
sudo ufw allow 5000
```
