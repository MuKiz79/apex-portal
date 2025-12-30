# APEX Executive - Claude Context File

Diese Datei dient als Kontext für Claude Code Sessions. Sie enthält den aktuellen Projektstand und wichtige Informationen.

---

## Projekt-Schnellübersicht

**Was ist APEX Executive?**
- Premium CV-Erstellung und Executive Mentoring Plattform
- Single Page Application (SPA) mit Firebase Backend
- Domain: https://apex-executive.de

**Tech-Stack:**
- Frontend: HTML, Tailwind CSS, Vanilla JS (ES6 Modules)
- Backend: Firebase (Auth, Firestore, Functions, Hosting, Storage)
- Payments: Stripe
- Video: Daily.co

---

## Kritische Dateien

| Datei | Beschreibung | Zeilen |
|-------|--------------|--------|
| `index.html` | Haupt-HTML, alle Views, Modals | ~4.000 |
| `js/app.js` | Hauptlogik, alle Funktionen | ~5.500 |
| `js/core.js` | Firebase-Init, Navigation | ~500 |
| `functions/index.js` | 11 Cloud Functions | ~1.200 |
| `firestore.rules` | Datenbank-Sicherheit | ~125 |

---

## Aktuelle Features (Stand: 30.12.2024)

### Implementiert
- [x] CV-Pakete mit Konfigurator (Sprache, Express, Add-ons)
- [x] Mentoring Sessions (Single, 3er-Paket, Komplettpaket)
- [x] Stripe Checkout Integration
- [x] User-Dashboard (Orders, Documents, Appointments, Profile)
- [x] **Mentor-Dashboard** (Verfügbarkeitskalender, zugewiesene Sessions)
- [x] **Admin Coach-Zuweisung** (Modal mit Coach-Auswahl)
- [x] **Daily.co Video-Meetings** (15 Min vor bis 2 Std nach Termin)
- [x] Termin-Vorschläge per Email
- [x] Automatische Account-Erstellung bei Checkout
- [x] PDF-Rechnungen per Email
- [x] Dokumenten-Upload/Download

### Pending / Bekannte Einschränkungen
- Daily.co API Key muss noch gesetzt werden (`firebase functions:secrets:set DAILY_API_KEY`)
- Coach-Bearbeitung im Admin nur über Firestore Console
- Keine Pagination bei großen Datenmengen

---

## Wichtige Konventionen

### Deployment-Reihenfolge
```bash
# IMMER diese Reihenfolge:
1. git add . && git commit -m "..." && git push
2. rm -rf dist && mkdir -p dist && cp index.html dist/ && cp -r js dist/ && cp -r css dist/ && cp manifest.json dist/ && cp sw.js dist/ && cp -r icons dist/
3. firebase deploy --only hosting
```

### Admin-Zugang
- Email: `muammer.kizilaslan@gmail.com`
- Hardcoded in `isAdmin()` Funktion

### Mentor-Erkennung
- Coach muss `email`-Feld in Firestore haben
- Email muss mit Login-Email übereinstimmen
- Nach Login wird `currentMentorData` gesetzt

---

## Firestore Collections

```
users/           # User-Profile
orders/          # Bestellungen + Termine
coaches/         # Mentoren/Coaches
articles/        # Blog-Artikel
strategyCalls/   # Anfragen
settings/        # System-Einstellungen
```

---

## Cloud Functions Endpoints

| Funktion | URL-Pattern |
|----------|-------------|
| createCheckoutSession | POST, creates Stripe session |
| stripeWebhook | POST, handles Stripe events |
| createMeetingRoom | POST, creates Daily.co room |
| createMeetingToken | POST, creates meeting access token |
| sendAppointmentProposalEmail | POST, sends 3 date options |
| notifyAdmin* | POST, admin notifications |

---

## Letzte Änderungen

### 30.12.2024
- Mentor-Dashboard mit Verfügbarkeitskalender implementiert
- Daily.co Video-Integration hinzugefügt
- Admin Coach-Zuweisung per Modal
- Bug-Fixes:
  - `isMeetingTimeNow()` Test-Modus entfernt
  - `hasCoachSession()` erkennt jetzt alle Mentoring-Produkte
  - `saveAvailability()` Konflikt behoben (User vs Mentor)
  - Willkommens-Email mit Password-Reset für neue Checkout-User

---

## Häufige Aufgaben

### Neuen Coach hinzufügen
1. Firestore → coaches → Dokument hinzufügen
2. Felder: name, email, role, experience, bio, image, expertise[], visible: true

### Feature testen
1. Login mit Test-Account
2. Browser Console öffnen (F12)
3. Auf Fehler prüfen

### Deployment-Probleme
```bash
firebase functions:log  # Logs prüfen
firebase deploy --only hosting --debug  # Debug-Mode
```

---

## Kontakt & Ressourcen

- **GitHub:** https://github.com/MuKiz79/apex-portal
- **Firebase Console:** https://console.firebase.google.com/project/apex-executive
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Dokumentation:** DOKUMENTATION.md (im Projektverzeichnis)
