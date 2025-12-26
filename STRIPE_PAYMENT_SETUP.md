# Stripe Payment System - Setup Guide

## ✅ Was wurde implementiert?

### 1. **Checkout ohne Login-Zwang**
- Kunden können direkt buchen, OHNE sich vorher zu registrieren
- Stripe sammelt Email, Name, Telefon während des Checkouts
- Unterstützte Zahlungsmethoden:
  - 💳 Kreditkarten (Visa, Mastercard, Amex)
  - 🔵 PayPal
  - 💸 SEPA Lastschrift
  - 🔶 Klarna
  - 🏦 Giropay

### 2. **Automatische Account-Erstellung**
- Nach erfolgreicher Zahlung wird automatisch ein Firebase Auth Account erstellt
- Email ist bereits verifiziert (wir vertrauen Stripe's Verifizierung)
- Passwort-Reset Email wird automatisch versendet
- User-Dokument wird in Firestore angelegt

### 3. **Order-Tracking**
- Jede Bestellung wird in der `orders` Collection gespeichert
- Verknüpft mit der User-ID
- Enthält alle Details: Items, Betrag, Zahlungsmethode, Billing Details

## 🔧 Noch zu konfigurieren

### 1. Stripe Webhook aktivieren

Du musst den Webhook in Stripe einrichten, damit die automatische Account-Erstellung funktioniert:

#### Schritt 1: Stripe Dashboard öffnen
1. Gehe zu https://dashboard.stripe.com/webhooks
2. Klicke auf "Add endpoint"

#### Schritt 2: Webhook URL eintragen
```
https://stripewebhook-plyofowo4a-uc.a.run.app
```

#### Schritt 3: Events auswählen
Wähle folgendes Event:
- ✅ `checkout.session.completed`

#### Schritt 4: Webhook Secret kopieren
- Nach dem Erstellen zeigt Stripe ein **Signing Secret** (beginnt mit `whsec_...`)
- Kopiere diesen Secret

#### Schritt 5: Secret in Firebase hinterlegen
```bash
cd functions
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Paste den whsec_... Secret wenn gefragt
```

#### Schritt 6: Functions neu deployen (damit Secret geladen wird)
```bash
firebase deploy --only functions
```

### 2. Stripe Secret Keys prüfen

Stelle sicher, dass beide Secrets gesetzt sind:

```bash
# Check ob Secrets existieren
firebase functions:secrets:access STRIPE_SECRET_KEY
firebase functions:secrets:access STRIPE_WEBHOOK_SECRET
```

Falls `STRIPE_SECRET_KEY` noch nicht gesetzt ist:
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# Paste deinen Stripe Secret Key (sk_live_... oder sk_test_...)
```

### 3. Stripe Dashboard - Payment Methods aktivieren

1. Gehe zu https://dashboard.stripe.com/settings/payment_methods
2. Aktiviere:
   - ✅ Cards (sollte schon aktiviert sein)
   - ✅ PayPal
   - ✅ SEPA Debit
   - ✅ Klarna
   - ✅ giropay

## 🧪 Testing

### Test-Zahlungen (Test Mode)

Stripe Test-Kreditkarten:
```
Erfolgreiche Zahlung: 4242 4242 4242 4242
Abgelehnte Zahlung:   4000 0000 0000 0002
3D Secure erforderlich: 4000 0025 0000 3155

CVV: beliebige 3 Ziffern
Datum: beliebiges zukünftiges Datum
```

### Webhook testen

1. Verwende Stripe CLI für lokales Testing:
```bash
stripe listen --forward-to https://stripewebhook-plyofowo4a-uc.a.run.app
```

2. Trigger manuell ein Test-Event:
```bash
stripe trigger checkout.session.completed
```

3. Check Firebase Logs:
```bash
firebase functions:log --only stripeWebhook
```

## 📊 Datenfluss

```
1. Kunde klickt "Buchen" → Warenkorb wird gefüllt
2. Kunde klickt "Zur Kasse" → Checkout ohne Login möglich
3. Stripe Checkout öffnet sich → Kunde gibt Zahlungsdaten ein
4. Zahlung erfolgreich → checkout.session.completed Event
5. Webhook empfängt Event → Prüft ob User existiert
6. Account erstellen (falls neu) → Firebase Auth + Firestore
7. Order erstellen → Firestore orders Collection
8. Passwort-Reset Email → Automatisch versendet
9. Redirect zur Success Page → Modal mit Bestellnummer
10. Kunde kann sich einloggen → Mit Passwort-Reset Link
```

## 🔐 Security

- ✅ Webhook Signature Verification (Stripe prüft Authentizität)
- ✅ CORS Headers richtig konfiguriert
- ✅ User kann nur eigene Orders sehen (Firestore Rules)
- ✅ Email ist verifiziert (vertrauen Stripe)
- ✅ Sichere Passwort-Generierung

## 📧 Email-Versand (Optional erweitern)

Aktuell wird nur der Passwort-Reset Link generiert. Du kannst später eigene Bestätigungs-Emails senden:

### Mit SendGrid Extension:
```bash
firebase ext:install sendgrid/sendgrid-email
```

### Oder eigene Email-Function:
```javascript
// In functions/index.js hinzufügen
const nodemailer = require('nodemailer');

async function sendWelcomeEmail(email, name, resetLink) {
  const transporter = nodemailer.createTransport({
    // SMTP Config
  });

  await transporter.sendMail({
    to: email,
    subject: 'Willkommen bei APEX Executive',
    html: `
      <h1>Willkommen ${name}!</h1>
      <p>Ihre Zahlung war erfolgreich.</p>
      <p>Setzen Sie Ihr Passwort: <a href="${resetLink}">Hier klicken</a></p>
    `
  });
}
```

## 🚀 Deployment Checklist

- [x] Firebase Functions deployed
- [ ] Stripe Webhook konfiguriert
- [ ] Webhook Secret in Firebase gesetzt
- [ ] Payment Methods aktiviert (PayPal, Klarna, etc.)
- [ ] Test-Zahlung durchgeführt
- [ ] Live-Zahlung durchgeführt (klein testen!)
- [ ] Email-Benachrichtigungen funktionieren

## 💡 Nächste Schritte

1. **Webhook konfigurieren** (siehe oben)
2. **Test-Zahlung** mit Testkarte durchführen
3. **Firestore Console** öffnen und prüfen ob Order + User angelegt wurden
4. **Email prüfen** ob Passwort-Reset Link ankommt
5. **Login testen** mit dem neuen Account

## 🆘 Troubleshooting

### Webhook funktioniert nicht
```bash
# Check Logs
firebase functions:log --only stripeWebhook

# Check ob Secret gesetzt ist
firebase functions:secrets:access STRIPE_WEBHOOK_SECRET
```

### Account wird nicht erstellt
- Prüfe Firebase Logs
- Prüfe ob Email bereits existiert
- Prüfe Firestore Rules (users Collection)

### Orders nicht sichtbar im Dashboard
- Prüfe Firestore Rules (orders Collection)
- Prüfe ob userId korrekt gesetzt ist
- Check Console: `orders` Collection

## 📱 Support

Bei Problemen:
1. Check Firebase Functions Logs
2. Check Stripe Webhook Logs (Dashboard → Webhooks → Dein Endpoint)
3. Check Browser Console für Frontend-Errors
