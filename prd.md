# Instrument Practice Tracker — PRD

## Overview

A wall-mounted QR scanner that logs instrument practice sessions without requiring a keyboard, phone, or app. Each person has one printed QR card. Scan to start, scan again to end. Everything is stored locally on a Raspberry Pi.

---

## Users

Multiple people in one household can each have their own QR card. For this first version, there is one physical station assigned to one instrument. Cards are printed, laminated, and kept near the station.

---

## Hardware Setup

| Component | Role |
|---|---|
| Raspberry Pi (any model with USB or CSI camera) | always-on station |
| USB webcam or Pi camera module | reads QR codes in a fixed scan zone |
| Printed QR cards (cardstock or laminated) | one per person |
| Optional: small speaker or buzzer | audible scan confirmation |
| Optional: LED | visual scan confirmation |

Physical setup guidelines:
- Mount the camera so it sees only a small, marked scan zone (not the whole room)
- Consistent overhead lighting reduces glare and false reads
- Print QR codes at a minimum of 4cm x 4cm
- Matte or laminated paper preferred over glossy to reduce glare

---

## QR Card Format

Each card encodes the person and the instrument together:

```
user:jasmin|instrument:piano
user:alex|instrument:piano
```

Because the scanner is physically mounted at one instrument, the instrument field is included for future-proofing when a second station or different instrument is added later.

Cards should be visually distinct with a printed name and color so people can tell them apart at a glance — not just by QR pattern.

---

## Scan Flow

```
First scan  → session STARTS  → confirmation sound/light
Second scan → session ENDS    → duration shown → session saved
```

The toggle is per-user. Multiple people can have open sessions at the same time (e.g. two people practicing together).

---

## Session Handling

### Duplicate scan cooldown
After any scan, the same QR payload is ignored for a configurable window (default: 5 seconds). This prevents a held card from immediately ending a session that just started.

### Forgotten end scans
Sessions open past a configurable inactivity limit (default: 4 hours) are automatically closed and marked `auto_closed`. They appear flagged on the dashboard for review.

### Suspiciously short sessions
Sessions that end in under 1 minute are flagged as `suspicious` and surfaced for review. They are saved but marked for human verification.

### Manual correction
Any session can be edited from the local dashboard: adjust start/end times, add notes, or delete. Edited sessions are marked `manual_fix` so the history is transparent.

---

## Dashboard Features (MVP)

- **Today view**: all sessions logged today — who, start time, end time, duration, status
- **Weekly summary**: total minutes per user this week
- **Open sessions**: any currently active (not yet ended) sessions
- **Flagged sessions**: `auto_closed` and `suspicious` entries needing review
- **Edit session**: change times, add note, or delete
- **Add missed session**: manually log a session that was never scanned

---

## Success Checks

- [ ] A person scans their card and the Pi logs a start event within 2 seconds
- [ ] Scanning the same card again ends the session and shows duration
- [ ] Holding the card in front of the camera does not create multiple sessions
- [ ] A forgotten open session is auto-closed overnight
- [ ] All sessions are visible on the local dashboard from another device on the same network
- [ ] A session with a bad time can be edited from the dashboard
- [ ] The scanner starts automatically on Pi boot without any manual steps
