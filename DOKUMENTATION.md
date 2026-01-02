# Karriaro - Technische Dokumentation

**Version:** 1.1
**Stand:** 02. Januar 2025
**Domain:** https://karriaro.de

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Technologie-Stack](#2-technologie-stack)
3. [Dateistruktur](#3-dateistruktur)
4. [Firebase-Konfiguration](#4-firebase-konfiguration)
5. [Firestore Datenbank](#5-firestore-datenbank)
6. [Cloud Functions](#6-cloud-functions)
7. [Authentifizierung](#7-authentifizierung)
8. [Zahlungsabwicklung (Stripe)](#8-zahlungsabwicklung-stripe)
9. [Video-Meeting (Daily.co)](#9-video-meeting-dailyco)
10. [Mentor-System](#10-mentor-system)
11. [Admin-Panel](#11-admin-panel)
12. [Deployment](#12-deployment)
13. [Fehlerbehebung](#13-fehlerbehebung)
14. [Wichtige Befehle](#14-wichtige-befehle)

---

## 1. Projektübersicht

Karriaro ist eine Premium-Plattform für:
- **CV-Erstellung** (Quick-Check bis C-Suite)
- **Executive Mentoring** (1:1 Sessions mit Führungskräften)
- **Karriereberatung** (Interview-Simulation, Zeugnis-Analyse)

### Hauptfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| CV-Pakete | 4 Stufen mit Konfigurator (Sprache, Express, Add-ons) |
| Mentoring | Single Session, 3er-Paket, Komplettpakete |
| Dashboard | Bestellungen, Dokumente, Termine, Profil |
| Mentor-Dashboard | Verfügbarkeitskalender, zugewiesene Sessions |
| Admin-Panel | Orders, Users, Coaches, Settings |
| Video-Meetings | Daily.co Integration für Mentoring-Sessions |

---

## 2. Technologie-Stack

### Frontend
- **HTML5** - Single Page Application (index.html)
- **Tailwind CSS** - Styling (via CDN)
- **Vanilla JavaScript** - Modular (ES6 Modules)
- **Font Awesome** - Icons

### Backend
- **Firebase** - Backend-as-a-Service
  - Authentication
  - Firestore (NoSQL Database)
  - Cloud Functions (Node.js 20)
  - Hosting
  - Storage

### Externe Dienste
- **Stripe** - Zahlungsabwicklung
- **Daily.co** - Video-Meetings
- **SMTP** - E-Mail-Versand (Nodemailer)

---

## 3. Dateistruktur

```
/Users/muammerkizilaslan/
├── index.html              # Haupt-HTML (SPA, ~4000 Zeilen)
├── js/
│   ├── app.js              # Hauptlogik (~5500 Zeilen)
│   ├── core.js             # Firebase-Init, Navigation, Utilities
│   └── data.js             # Sample-Daten (Artikel)
├── css/
│   └── styles.css          # Custom Styles
├── functions/
│   ├── index.js            # Cloud Functions (~1200 Zeilen)
│   └── package.json        # Dependencies
├── icons/                  # PWA Icons
├── images/                 # Statische Bilder
├── firestore.rules         # Datenbank-Sicherheitsregeln
├── storage.rules           # Storage-Sicherheitsregeln
├── firebase.json           # Firebase-Konfiguration
├── manifest.json           # PWA Manifest
└── sw.js                   # Service Worker
```

---

## 4. Firebase-Konfiguration

### Projekt-Details
- **Project ID:** `apex-executive` (Firebase Project ID bleibt unverändert)
- **Region:** `us-central1`
- **Hosting URL:** https://apex-executive.web.app (Legacy)
- **Custom Domain:** https://karriaro.de

### Secrets (Firebase Functions)
```bash
# Secrets auflisten
firebase functions:secrets:list

# Secret setzen
firebase functions:secrets:set SECRET_NAME

# Erforderliche Secrets:
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - SMTP_HOST
# - SMTP_USER
# - SMTP_PASS
# - DAILY_API_KEY
```

### Firebase Config (im Code)
```javascript
// js/core.js
const firebaseConfig = {
    apiKey: "...",
    authDomain: "apex-executive.firebaseapp.com",
    projectId: "apex-executive",
    storageBucket: "apex-executive.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
```

---

## 5. Firestore Datenbank

### Collections

#### `users`
```javascript
{
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  position: string,
  profilePicture: string,  // Storage URL
  createdAt: timestamp,
  stripeCustomerId: string,
  needsPasswordReset: boolean
}
```

#### `orders`
```javascript
{
  userId: string,
  customerEmail: string,
  customerName: string,
  items: [{
    title: string,
    price: number
  }],
  total: number,
  status: "processing" | "confirmed" | "completed" | "cancelled",
  date: timestamp,

  // Termin-Felder
  appointment: {
    datetime: string,      // ISO Format
    confirmed: boolean,
    bookedAt: timestamp
  },
  appointmentProposals: [{
    date: string,
    time: string,
    datetime: string
  }],
  appointmentStatus: "pending" | "confirmed" | "declined",
  appointmentDeclineReason: string,

  // Mentor-Zuweisung
  assignedCoachId: string,
  assignedCoachName: string,
  assignedAt: timestamp,

  // Meeting
  meetingRoom: {
    url: string,
    roomName: string,
    createdAt: timestamp,
    expiresAt: timestamp
  },

  // Stripe
  stripeSessionId: string,
  stripePaymentIntent: string,
  stripeCustomerId: string
}
```

#### `coaches`
```javascript
{
  name: string,
  email: string,           // Für Mentor-Login-Erkennung
  userId: string,          // Firebase Auth UID (nach erstem Login)
  role: string,
  experience: string,
  bio: string,
  image: string,
  expertise: [string],
  industry: string,
  visible: boolean,
  availability: {          // Mentor-Verfügbarkeit
    "2024-01-15": ["09:00", "10:00", "14:00"],
    "2024-01-16": ["10:00", "11:00"]
  }
}
```

#### `articles`
```javascript
{
  title: string,
  excerpt: string,
  content: string,
  image: string,
  author: string,
  date: string,
  category: string
}
```

#### `strategyCalls`
```javascript
{
  name: string,
  email: string,
  phone: string,
  message: string,
  preferredTimes: [string],
  createdAt: timestamp,
  status: "new" | "contacted" | "completed"
}
```

#### `settings`
```javascript
// settings/mentoring
{
  slotsText: string  // Dynamischer Text für Verfügbarkeit
}
```

### Sicherheitsregeln (firestore.rules)

**Wichtige Regeln:**
- Users: Nur eigenes Profil lesen/schreiben
- Orders: User liest eigene, Mentor liest zugewiesene, Admin alles
- Coaches: Öffentlich lesbar, Mentor kann eigene Verfügbarkeit ändern
- Admin: Basiert auf Email `muammer.kizilaslan@gmail.com`

---

## 6. Cloud Functions

### Übersicht (11 Funktionen)

| Funktion | Typ | Beschreibung |
|----------|-----|--------------|
| `createCheckoutSession` | onRequest | Erstellt Stripe Checkout Session |
| `stripeWebhook` | onRequest | Verarbeitet Stripe Events |
| `getOrderBySessionId` | onCall | Lädt Order nach Session ID |
| `sendAppointmentProposalEmail` | onRequest | Sendet Terminvorschläge |
| `notifyAdminAppointmentAccepted` | onRequest | Benachrichtigt Admin bei Zusage |
| `notifyAdminAppointmentDeclined` | onRequest | Benachrichtigt Admin bei Absage |
| `notifyCustomerDocumentReady` | onRequest | Benachrichtigt Kunde bei Dokument |
| `notifyAdminDocumentUploaded` | onRequest | Benachrichtigt Admin bei Upload |
| `setEmailVerified` | onRequest | Setzt Email als verifiziert |
| `createMeetingRoom` | onRequest | Erstellt Daily.co Meeting-Raum |
| `createMeetingToken` | onRequest | Erstellt Meeting-Zugangstoken |

### Stripe Webhook Flow

```
1. Kunde klickt "Kaufen"
2. createCheckoutSession → Stripe Checkout URL
3. Kunde bezahlt bei Stripe
4. stripeWebhook empfängt checkout.session.completed
5. Order wird in Firestore erstellt
6. Bestätigungs-Email mit PDF-Rechnung wird gesendet
7. Falls neuer Kunde: Account wird erstellt + Password-Reset-Email
```

---

## 7. Authentifizierung

### Login-Flow
1. User gibt Email/Passwort ein
2. Firebase Auth prüft Credentials
3. Bei Erfolg: `onAuthStateChanged` wird getriggert
4. `updateAuthUI()` aktualisiert Navigation
5. `checkAndSetupMentor()` prüft Mentor-Status

### Mentor-Erkennung
```javascript
// In updateAuthUI()
async function checkAndSetupMentor(state) {
    // Suche Coach mit matching Email
    const q = query(coachesRef, where('email', '==', state.user.email));
    // Wenn gefunden: currentMentorData wird gesetzt
    // Mentor-Tab wird sichtbar
}
```

### Admin-Erkennung
```javascript
function isAdmin(email) {
    return email === 'muammer.kizilaslan@gmail.com';
}
```

---

## 8. Zahlungsabwicklung (Stripe)

### Konfiguration
- **Webhook URL:** `https://stripewebhook-plyofowo4a-uc.a.run.app`
- **Success URL:** `https://karriaro.de/?payment=success&session_id={CHECKOUT_SESSION_ID}`
- **Cancel URL:** `https://karriaro.de/?payment=cancelled`

### Produkte (in Code definiert)

| Produkt | Preis |
|---------|-------|
| CV Quick-Check | €99 |
| Young Professional CV | €249 |
| Senior Professional CV | €490 |
| Executive C-Suite CV | €1.290 |
| Single Mentoring Session | €350 |
| 3-Session Package | €950 |
| Komplettpaket Senior | €1.299 |
| Komplettpaket C-Suite | €1.799 |

### Add-ons
- Express-Lieferung: +€99
- Interview-Simulation 60min: €199
- Zeugnis-Analyse: €49
- Executive Landing Page: €499

---

## 9. Video-Meeting (Daily.co)

### Setup
1. Account erstellen: https://dashboard.daily.co/
2. API Key holen: Developers → API Keys
3. Secret setzen: `firebase functions:secrets:set DAILY_API_KEY`

### Meeting-Flow
```
1. Termin wird bestätigt
2. 15 Min vor Termin erscheint "Meeting beitreten" Button
3. Klick ruft createMeetingRoom auf
4. Daily.co Room wird erstellt (2h Gültigkeit)
5. Meeting-URL wird in Order gespeichert
6. Modal öffnet sich mit Video-Iframe
```

### Meeting-Zeitfenster
- Verfügbar: 15 Minuten vor bis 2 Stunden nach Termin
- Raum läuft automatisch ab

---

## 10. Mentor-System

### Mentor werden
1. Admin erstellt Coach in Firestore mit `email`-Feld
2. Mentor loggt sich ein (gleicher Login wie Kunden)
3. System erkennt Email-Match → Mentor-Tab erscheint
4. Coach-Dokument wird mit `userId` aktualisiert

### Verfügbarkeitskalender
- 2-Wochen-Ansicht
- Zeitslots: 09:00 - 17:00 (stündlich)
- Klick togglet Verfügbarkeit
- Grün = verfügbar, Grau = nicht verfügbar, Blau = gebucht

### Coach-Zuweisung (Admin)
1. Admin öffnet Order im Admin-Panel
2. Klickt "Mentor zuweisen"
3. Modal zeigt alle Coaches mit Verfügbarkeit
4. Admin wählt Coach
5. Order wird mit `assignedCoachId` und `assignedCoachName` aktualisiert

---

## 11. Admin-Panel

### Zugang
- URL: https://karriaro.de → Login → Admin-Button (nur für Admin sichtbar)
- Admin-Email: `muammer.kizilaslan@gmail.com`

### Tabs

| Tab | Funktionen |
|-----|------------|
| Orders | Alle Bestellungen, Status ändern, Mentor zuweisen, Dokumente hochladen |
| Users | Alle User, Export CSV, Email verifizieren |
| Strategy | Strategy-Call Anfragen verwalten |
| Coaches | Coach-Sichtbarkeit togglen |
| Documents | Alle Dokumente einsehen |
| Settings | Mentoring-Slots Text konfigurieren |

---

## 12. Deployment

### Standard-Deployment
```bash
# 1. Änderungen committen
git add .
git commit -m "Beschreibung"
git push

# 2. Firebase deployen
rm -rf dist && mkdir -p dist
cp index.html dist/
cp -r js dist/
cp -r css dist/
cp manifest.json dist/
cp sw.js dist/
cp -r icons dist/
cp -r images dist/ 2>/dev/null

firebase deploy --only hosting
```

### Vollständiges Deployment
```bash
# Hosting + Functions + Rules
firebase deploy --only hosting,functions,firestore:rules
```

### Nur Functions
```bash
firebase deploy --only functions
```

### Nur Firestore Rules
```bash
firebase deploy --only firestore:rules
```

---

## 13. Fehlerbehebung

### Häufige Probleme

#### "Permission denied" bei Firestore
- Prüfen ob User eingeloggt ist
- Firestore Rules checken
- `firebase deploy --only firestore:rules`

#### Cloud Function gibt 500 zurück
```bash
# Logs prüfen
firebase functions:log

# Spezifische Funktion
firebase functions:log --only createCheckoutSession
```

#### Stripe Webhook funktioniert nicht
1. Webhook-Secret prüfen: `firebase functions:secrets:get STRIPE_WEBHOOK_SECRET`
2. Stripe Dashboard → Webhooks → Events prüfen
3. Endpoint URL muss exakt stimmen

#### Meeting-Button erscheint nicht
- Prüfen ob Termin bestätigt ist (`appointment.confirmed === true`)
- Zeit prüfen (15 Min vor bis 2 Std nach)
- Daily.co API Key prüfen

#### Mentor-Tab erscheint nicht
- Coach-Dokument muss `email`-Feld haben
- Email muss exakt mit Login-Email übereinstimmen
- Browser Console auf Fehler prüfen

### Debug-Modus aktivieren
```javascript
// In app.js, Zeile 15
const IS_PRODUCTION = false;  // Temporär auf false setzen
// Dann werden console.log Ausgaben angezeigt
```

---

## 14. Wichtige Befehle

### Firebase CLI
```bash
# Login
firebase login

# Projekt-Liste
firebase projects:list

# Aktives Projekt
firebase use apex-executive

# Deploy
firebase deploy

# Logs
firebase functions:log

# Secrets verwalten
firebase functions:secrets:list
firebase functions:secrets:set SECRET_NAME
firebase functions:secrets:access SECRET_NAME
```

### Git
```bash
# Status
git status

# Alle Änderungen committen
git add .
git commit -m "Message"
git push

# Letzten Commit anzeigen
git log -1

# Änderungen rückgängig (vor commit)
git checkout -- filename

# Änderungen rückgängig (nach commit, noch nicht gepusht)
git reset --soft HEAD~1
```

### NPM (im functions Ordner)
```bash
cd functions
npm install
npm install package-name --save
npm update
```

---

## Anhang: Wichtige URLs

| Dienst | URL |
|--------|-----|
| Produktion | https://karriaro.de |
| Firebase Console | https://console.firebase.google.com/project/apex-executive |
| Stripe Dashboard | https://dashboard.stripe.com |
| Daily.co Dashboard | https://dashboard.daily.co |
| GitHub Repository | https://github.com/MuKiz79/apex-portal |

---

## Changelog

### Version 1.0 (30.12.2024)
- Initiale Dokumentation erstellt
- Mentor-Dashboard mit Verfügbarkeitskalender
- Daily.co Video-Integration
- Admin Coach-Zuweisung
- Automatische Willkommens-Email für neue Checkout-User
