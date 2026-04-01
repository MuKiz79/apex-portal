#!/bin/bash

# Karriaro Build Script
# Erstellt den dist/ Ordner für Firebase Hosting Deployment

echo "🔨 Building Karriaro..."

# 1. Tailwind CSS kompilieren
echo "🎨 Kompiliere Tailwind CSS..."
./tailwindcss -i css/input.css -o css/output.css --minify
echo "   CSS Größe: $(ls -lh css/output.css | awk '{print $5}')"

# 2. Lösche alten dist Ordner
rm -rf dist

# 3. Erstelle dist Ordner
mkdir -p dist

# 4. Kopiere Hauptdateien
cp index.html dist/
cp manifest.json dist/
cp sw.js dist/
cp robots.txt dist/
cp sitemap.xml dist/

# 5. Kopiere Ordner
cp -r js dist/
cp -r css dist/
cp -r images dist/
cp -r icons dist/
cp -r cv-templates dist/
cp -r locales dist/

# 6. Template Designer bauen (falls node_modules vorhanden) und kopieren
if [ -d "template-designer/node_modules" ]; then
    echo "🎨 Baue Template Designer..."
    (cd template-designer && npm run build 2>/dev/null) || echo "   ⚠️ Template Designer Build übersprungen"
fi
# WICHTIG: template-designer muss aus dem DIST Ordner kopiert werden (gebaute Version)
cp -r template-designer/dist dist/template-designer

echo "✅ Build fertig! Dateien in dist/"
echo ""
echo "📁 Inhalt:"
ls -la dist/
echo ""
echo "🚀 Deployment mit: firebase deploy --only hosting"
