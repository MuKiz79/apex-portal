#!/bin/bash

# Karriaro Build Script
# Erstellt den dist/ Ordner für Firebase Hosting Deployment

echo "🔨 Building Karriaro..."

# Lösche alten dist Ordner
rm -rf dist

# Erstelle dist Ordner
mkdir -p dist

# Kopiere Hauptdateien
cp index.html dist/
cp manifest.json dist/
cp sw.js dist/

# Kopiere Ordner
cp -r js dist/
cp -r css dist/
cp -r images dist/
cp -r icons dist/
cp -r cv-templates dist/

# WICHTIG: template-designer muss aus dem DIST Ordner kopiert werden (gebaute Version)
cp -r template-designer/dist dist/template-designer

echo "✅ Build fertig! Dateien in dist/"
echo ""
echo "📁 Inhalt:"
ls -la dist/
echo ""
echo "🚀 Deployment mit: firebase deploy --only hosting"
