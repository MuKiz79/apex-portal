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
- Template Designer: React + pdfme (unter `/template-designer/`)

---

## Kritische Dateien

| Datei | Beschreibung | Zeilen |
|-------|--------------|--------|
| `index.html` | Haupt-HTML, alle Views, Modals | ~4.500 |
| `js/app.js` | Hauptlogik, alle Funktionen | ~5.800 |
| `js/core.js` | Firebase-Init, Navigation | ~500 |
| `functions/index.js` | 11 Cloud Functions | ~1.200 |
| `firestore.rules` | Datenbank-Sicherheit | ~165 |
| `cv-templates/templates.json` | CV-Template Definitionen | ~150 |
| `template-designer/` | React-App für Template-Bearbeitung | - |

---

## Aktuelle Features (Stand: 02.01.2025)

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
- [x] **Coach-Bearbeitung im Admin** (Hinzufügen, Bearbeiten, Löschen, Sichtbarkeit)
- [x] **Pagination** für Admin-Listen (Users, Strategy Calls)
- [x] **CV Template System** (SVG-basiert mit Farbwahl)
- [x] **Admin Template-Verwaltung** (Templates aktivieren/deaktivieren)
- [x] **Template Designer** (React + pdfme für Template-Erstellung)

### Landing Page
- [x] Hero Section: "CV-Manufaktur | Executive Mentoring"
- [x] Testimonials (3 Stück: CV-Paket, Mentoring, Komplettpaket)
- [x] **"Wann brauche ich einen Mentor?"** Sektion mit 4 Use Cases
- [x] CV-Pakete Grid (Young Professional, Senior Professional, Executive)
- [x] Mentoring-Bereich mit Coach-Auswahl

### Pending / Bekannte Einschränkungen
- Daily.co API Key muss noch gesetzt werden (`firebase functions:secrets:set DAILY_API_KEY`)

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
settings/        # System-Einstellungen (inkl. templateStatus)
cvTemplates/     # CV-Template Definitionen (für pdfme)
cvProjects/      # Kunden CV-Projekte (Fragebogen, Dokumente)
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

### 02.01.2025
- **Landing Page Optimierungen:**
  - Hero Section: "CV-Manufaktur | Executive Mentoring - Ihre zwei Säulen zum Karriereerfolg"
  - Testimonials komplett überarbeitet (Manufaktur-Fokus, Anti-KI-Messaging)
  - Neuer Bereich "Wann brauche ich einen Mentor?" mit 4 Use Cases:
    - Gehaltsverhandlung
    - Jobwechsel planen
    - Erste Führungsrolle
    - Strategisches Sparring
- **Admin Template-Verwaltung:**
  - Toggle zum Aktivieren/Deaktivieren von Templates
  - Persistierung in Firestore (`settings/templateStatus`)
  - Nur aktivierte Templates werden Kunden angezeigt
- **CV Template System:**
  - SVG-basierte Templates (kreativ, compact)
  - Farbwahl für Kunden
  - Preview-Komponente mit Zoom-Funktion
- **Template Designer** (React + pdfme):
  - Separate React-App unter `/template-designer/`
  - SVG zu PDF Konvertierung
  - Farbpicker für Template-Anpassung
  - Speicherung in Firestore

### 31.12.2024
- **Pagination** für Admin-Listen implementiert (Users: 20/Seite, Strategy Calls: 15/Seite)
- CLAUDE.md aktualisiert - Coach-Bearbeitung war bereits implementiert

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

## CV Template System

### Verfügbare Templates
| ID | Name | Farben |
|----|------|--------|
| `kreativ` | Kreativ Design | primary, accent, circle |
| `compact` | Compact Design | primary |

### Template-Struktur
- **SVG-Dateien:** `/template-designer/template-{id}.svg`
- **Konfiguration:** `/cv-templates/templates.json`
- **Admin-Toggle:** Speichert disabled-Liste in `settings/templateStatus`

### Template Designer
- **URL:** `/template-designer/` (nur für Admins)
- **Tech:** React + pdfme + jsPDF
- **Funktion:** SVG laden → Farben anpassen → Als PDF-Template speichern

---

## Häufige Aufgaben

### Neuen Coach hinzufügen (via Admin-Panel)
1. Als Admin einloggen → Admin-Bereich → Tab "Mentoren"
2. "Neuer Mentor" Button klicken
3. Formular ausfüllen (Name, Email, Rolle, Erfahrung, Bio, Bild-URL, Expertise)
4. Speichern

### Template aktivieren/deaktivieren
1. Als Admin einloggen → Admin-Bereich → Tab "Einstellungen"
2. Bereich "CV Templates" finden
3. Toggle für gewünschtes Template klicken

### Feature testen
1. Login mit Test-Account
2. Browser Console öffnen (F12)
3. Auf Fehler prüfen

### Deployment-Probleme
```bash
firebase functions:log  # Logs prüfen
firebase deploy --only hosting --debug  # Debug-Mode
```

### Template Designer deployen
```bash
cd template-designer
npm run build
cd ..
# Dann normales Hosting-Deploy
```

---

## Kontakt & Ressourcen

- **GitHub:** https://github.com/MuKiz79/apex-portal
- **Firebase Console:** https://console.firebase.google.com/project/apex-executive
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Dokumentation:** DOKUMENTATION.md (im Projektverzeichnis)
