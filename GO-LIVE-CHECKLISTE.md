# Karriaro GO-LIVE Checkliste

Diese Checkliste enthält alle Schritte, um die Website für Suchmaschinen sichtbar zu machen.

---

## Vor dem GO-LIVE erledigen

### 1. Social Share PNG erstellen
- [ ] Öffne im Browser: `file:///Users/muammerkizilaslan/Projects/apex-portal/images/generate-social-share.html`
- [ ] Klicke auf "Als PNG herunterladen"
- [ ] Speichere die Datei als `karriaro-social-share.png` im `/images/` Ordner

### 2. Domain konfigurieren (falls noch nicht geschehen)
- [ ] Firebase Hosting mit `karriaro.de` verbinden
- [ ] DNS-Einträge bei Domain-Provider setzen
- [ ] SSL-Zertifikat wird automatisch von Firebase erstellt

---

## GO-LIVE Schritte

### Schritt 1: robots.txt aktivieren
Datei: `/robots.txt`

**Vorher (blockiert):**
```
User-agent: *
Disallow: /
```

**Nachher (erlaubt):**
```
User-agent: *
Allow: /

Sitemap: https://karriaro.de/sitemap.xml
```

### Schritt 2: Meta-Tag in index.html ändern
Datei: `/index.html` (Zeile 11)

**Vorher:**
```html
<meta name="robots" content="noindex, nofollow">
```

**Nachher:**
```html
<meta name="robots" content="index, follow">
```

### Schritt 3: Deployen
```bash
cd /Users/muammerkizilaslan/Projects/apex-portal
bash build.sh && firebase deploy --only hosting
```

### Schritt 4: Bei Suchmaschinen anmelden
- [ ] **Google Search Console:** https://search.google.com/search-console
  - Property hinzufügen: `https://karriaro.de`
  - Sitemap einreichen: `https://karriaro.de/sitemap.xml`

- [ ] **Bing Webmaster Tools:** https://www.bing.com/webmasters
  - Website hinzufügen: `https://karriaro.de`
  - Sitemap einreichen

---

## Nach dem GO-LIVE prüfen

### SEO-Check
- [ ] Teste Open Graph: https://developers.facebook.com/tools/debug/
- [ ] Teste Twitter Card: https://cards-dev.twitter.com/validator
- [ ] Teste Rich Snippets: https://search.google.com/test/rich-results
- [ ] Teste Mobile-Freundlichkeit: https://search.google.com/test/mobile-friendly

### Technische Checks
- [ ] Alle Seiten laden korrekt (Home, CV-Pakete, Coaches, FAQ, etc.)
- [ ] Favicon erscheint im Browser-Tab
- [ ] PWA installierbar (auf Mobile testen)
- [ ] Stripe Checkout funktioniert
- [ ] Login/Registrierung funktioniert

---

## Aktueller SEO-Status

| Element | Status | Datei |
|---------|--------|-------|
| robots.txt | Blockiert (Disallow) | `/robots.txt` |
| sitemap.xml | Erstellt | `/sitemap.xml` |
| Meta Description | Vorhanden | `/index.html` |
| Open Graph Tags | Vorhanden | `/index.html` |
| Twitter Cards | Vorhanden | `/index.html` |
| JSON-LD Schema | Vorhanden | `/index.html` |
| Canonical URL | Vorhanden | `/index.html` |
| Favicon (SVG) | Vorhanden | `/images/favicon.svg` |
| Social Share PNG | Generator erstellt | `/images/generate-social-share.html` |

---

## Schnellreferenz: Alle SEO-Dateien

```
/robots.txt                          # Crawler-Steuerung
/sitemap.xml                         # Seitenübersicht für Suchmaschinen
/index.html                          # Meta Tags, JSON-LD Schema
/images/favicon.svg                  # Browser-Tab Icon
/images/karriaro-social-share.png    # Social Media Vorschaubild (noch erstellen!)
/images/generate-social-share.html   # PNG-Generator für Social Share
/icons/icon-*.png                    # PWA Icons (8 Größen)
/manifest.json                       # PWA Manifest
```

---

**Erstellt:** 10. Januar 2026
**Projekt:** Karriaro (karriaro.de)
