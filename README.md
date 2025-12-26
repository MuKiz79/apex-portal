# APEX Executive - Karriere-Architektur & CV-Manufaktur

Professionelle Karriereberatung, CV-Erstellung und Executive Coaching für Führungskräfte.

## 🚀 Features

- ✅ **Benutzer-Authentifizierung** - Registrierung, Login, E-Mail-Verifizierung
- ✅ **10% Mitglieder-Rabatt** - Automatisch für registrierte Benutzer
- ✅ **Warenkorb & Checkout** - LocalStorage-Persistenz
- ✅ **Coach-Katalog** - Filtering nach Industrie, Detail-Ansichten
- ✅ **Dashboard** - Profilbild-Upload, Bestellübersicht, Terminkalender
- ✅ **Terminbuchung** - Für gebuchte Coach-Sessions
- ✅ **CV-Pakete** - Young Professional, Senior Professional, Executive C-Suite
- ✅ **Insights Journal** - Artikel zu Karriere-Themen
- ✅ **Responsive Design** - Mobile-optimiert mit Tailwind CSS

## 📁 Struktur

```
apex-executive/
├── index.html          # Haupt-HTML (modulare Version)
├── css/
│   └── styles.css     # Custom Styles
└── js/
    ├── core.js        # Firebase, Utils, Navigation (208 Zeilen)
    └── app.js         # Features, Auth, Cart, Dashboard (828 Zeilen)
```

## 🔧 Technologie-Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript (ES6 Modules)
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Icons**: Font Awesome 6
- **Fonts**: Google Fonts (Cinzel, Lato)

## 🎨 Design

- **Farbschema**:
  - Brand Dark: #0B1120
  - Brand Gold: #C6A87C
  - Brand Light: #F3F4F6
- **Typography**: Cinzel (Serif), Lato (Sans-serif)
- **Patterns**: Luxury minimalist design

## 🔥 Firebase Setup

### Firebase Config erforderlich:

Die App ist mit Firebase konfiguriert. Falls du dein eigenes Firebase-Projekt nutzen möchtest:

1. Erstelle ein Firebase-Projekt auf https://console.firebase.google.com/
2. Aktiviere **Authentication** (Email/Password)
3. Aktiviere **Firestore Database**
4. Aktiviere **Storage**
5. Kopiere deine Config in `js/core.js`

### Firestore Collections:

- `users` - Benutzerprofile
- `orders` - Bestellungen mit Rabatt-Info
- `coaches` - Coach-Profile (optional)
- `articles` - Journal-Artikel (optional)

## 🚀 Deployment

### GitHub Pages:

1. Upload alle Dateien zu GitHub
2. Gehe zu **Settings** → **Pages**
3. Source: `main` branch, `/ (root)`
4. Speichern
5. Deine Seite ist live unter: `https://username.github.io/apex-executive/`

### Netlify / Vercel:

1. Verbinde dein GitHub Repo
2. Build Command: (leer lassen)
3. Publish Directory: `/`
4. Deploy!

## 📝 Lizenz

© 2024 APEX Executive. Alle Rechte vorbehalten.

---

**Entwickelt mit** [Claude Code](https://claude.com/claude-code)
