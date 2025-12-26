#!/bin/bash

echo "🚀 APEX Executive - GitHub Deploy Script"
echo "=========================================="
echo ""

# Git initialisieren
git init

# Alle Dateien hinzufügen
git add .

# Commit erstellen
git commit -m "Initial commit: Modulare APEX Executive Plattform

✅ Features:
- Benutzer-Authentifizierung mit Firebase
- 10% Mitglieder-Rabatt System
- Warenkorb & Checkout
- Coach-Katalog mit Filtering
- Dashboard mit Profilbild-Upload
- Terminbuchung für Coach-Sessions
- Responsive Design

🏗️ Struktur:
- Modularer Code (core.js + app.js)
- Extrahiertes CSS
- ES6 Modules
- Firebase Integration

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

echo ""
echo "✅ Lokales Repository erstellt!"
echo ""
echo "📝 Nächste Schritte:"
echo "1. Erstelle ein GitHub Repository: https://github.com/new"
echo "2. Kopiere die Remote URL (z.B. https://github.com/username/apex-executive.git)"
echo "3. Führe aus:"
echo "   git remote add origin <DEINE-GITHUB-URL>"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""

