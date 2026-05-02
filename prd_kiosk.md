# PRD: Kiosk Scanner

## 1. Overview

This document defines the kiosk-mode scanner application for instrument practice tracking.

This version includes:
- Kiosk behavior (tablet-only scanner)
- Online-only architecture
- Clear, simplified UI design (see section 6)

---

## 2. Core Principles

### 2.1 Kiosk Behavior
- Tablet is dedicated to scanning
- No navigation / no admin UI
- Always on `/scan`
- Large, clear, minimal UI

### 2.2 Online-Only
- Must connect to backend before scanning
- No offline storage
- No sync queue

### 2.3 Session Rule
- One open session per person
- Must end previous session before starting new instrument

---

## 3. User Flow

1. Tablet opens `/scan`
2. System checks `/api/health`
3. If online → enable scanner
4. User scans QR
5. `/api/scan` decides:
   - START
   - END
   - BLOCK
6. UI shows result clearly
7. Scanner resets

---

## 4. API Requirements

### GET /api/health
- Must confirm DB connectivity

### POST /api/scan
- Server decides all logic
- Returns:
  - started
  - ended
  - blocked
  - error

---

## 5. Kiosk UI Design (NEW)

This replaces previous UI assumptions.

### Layout Structure

```
--------------------------------------
| Practice Tracker        [Online]    |
| May 1, 2026                         |
|                                    |
|       [ SCAN QR BUTTON ]           |
|                                    |
| CURRENTLY PRACTICING               |
| [ active session card ]            |
|                                    |
| LEADERBOARD (top 3 only)           |
| [ simplified leaderboard ]         |
--------------------------------------
(scroll down to see more)
```

---

## 6. Scanner Button (Critical Requirement)

### Design

- Centered on screen
- Moderate size (NOT full screen)
- Large enough for quick tapping
- Rounded rectangle
- Gradient (blue → purple)
- Icon + text

### Content

```
[ QR ICON ]
Scan QR Code
```

### Behavior

- Tap anywhere on button → activate camera
- After scan → button temporarily disabled
- Re-enabled after result display

---

## 7. Removed Elements

These are intentionally removed:

- ❌ "How it works"
- ❌ Help text
- ❌ Instructions paragraphs
- ❌ Admin controls

Reason:
Kiosk must be **zero-thinking interaction**

---

## 8. Currently Practicing Section

### Design

- Card-based
- Shows:
  - Name
  - Instrument
  - Start time
  - Timer (live)

Example:

```
austin
Piano
Started 10:53 AM

00:18:47
```

---

## 9. Leaderboard (Kiosk Version)

### Rules

- Show only top 3
- Minimal info
- No scrolling

### Content

- Rank
- Name
- Total time
- Progress bar

### Example

```
1. jasmin   2h 12m
2. austin   22 min
3. olivia   14 min
```

---

## 10. Visual Principles

### Must Have

- Large typography
- High contrast
- Minimal text
- Clear states
- Soft colors (blue/purple)

### Must Avoid

- Dense tables
- Small buttons
- Multi-step flows
- Scrolling-heavy UI

---

## 11. Scanner States

### Ready
"Ready to Scan"

### Processing
"Recording Practice..."

### Started
"Practice Started"

### Ended
"Practice Ended"

### Blocked
"Finish Current Session First"

### Offline
"Scanner Offline"

---

## 12. Implementation Plan

### Phase 0
- Move dashboard → `/admin`
- Add authentication

### Phase 1
- Build `/scan` UI (based on new design)
- Add large scan button
- Add sections:
  - current session
  - leaderboard (top 3)

### Phase 2
- Add `/api/health`
- Disable scanning when offline

### Phase 3
- Harden `/api/scan`
- Enforce session rules

### Phase 4
- PWA install + kiosk setup

---

## 13. Cursor Prompt

Use:

"""
Implement kiosk scanner UI based on PRD.

Requirements:
- Moderate size scan button (center)
- Show current session
- Show top 3 leaderboard
- Remove instructions/help text
- No admin UI
- Online-only scanning
- Health check required

Do NOT add offline sync.
Do NOT show dashboard tables.

Keep UI minimal and touch-friendly.
"""

---

## 14. Acceptance Criteria

- Tablet shows clean kiosk UI
- Scan button is obvious and centered
- No confusion for user
- One tap → scan
- No extra text
- Leaderboard visible but minimal
- Works reliably with backend

