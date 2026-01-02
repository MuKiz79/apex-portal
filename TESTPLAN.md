# Karriaro Testplan

## Übersicht

Dieser Testplan deckt alle Kernfunktionalitäten der Karriaro-Plattform ab. Teste jeden Abschnitt systematisch und dokumentiere Fehler.

**Test-URL:** https://karriaro.de
**Admin-Account:** muammer.kizilaslan@gmail.com
**Testdatum:** _______________

---

## 1. Authentifizierung & Benutzerverwaltung

### 1.1 Registrierung
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 1.1.1 | Registrierung mit gültiger Email | Account wird erstellt, Verifizierungs-Email wird gesendet | [ ] |
| 1.1.2 | Registrierung mit bereits existierender Email | Fehlermeldung wird angezeigt | [ ] |
| 1.1.3 | Registrierung mit ungültigem Passwort (< 8 Zeichen) | Validierungsfehler | [ ] |
| 1.1.4 | Passwort-Bestätigung stimmt nicht überein | Fehlermeldung | [ ] |

### 1.2 Login
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 1.2.1 | Login mit korrekten Daten | Weiterleitung zum Dashboard | [ ] |
| 1.2.2 | Login mit falschen Daten | Fehlermeldung | [ ] |
| 1.2.3 | "Passwort vergessen" Funktion | Reset-Email wird gesendet | [ ] |
| 1.2.4 | Logout | Session wird beendet, Weiterleitung zur Startseite | [ ] |

### 1.3 Profil
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 1.3.1 | Profildaten ändern (Name, Telefon) | Daten werden gespeichert | [ ] |
| 1.3.2 | Profilbild hochladen | Bild wird angezeigt | [ ] |
| 1.3.3 | Passwort ändern | Neues Passwort funktioniert | [ ] |

---

## 2. Produkte & Warenkorb

### 2.1 CV-Pakete
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 2.1.1 | Young Professional Paket anzeigen | Preis €249, Details korrekt | [ ] |
| 2.1.2 | Senior Professional Paket anzeigen | Preis €490, Details korrekt | [ ] |
| 2.1.3 | Executive Paket anzeigen | Preis €890, Details korrekt | [ ] |
| 2.1.4 | Sprache wechseln (DE/EN) | Preis ändert sich für 2. Sprache | [ ] |
| 2.1.5 | Express-Option aktivieren | +€99 zum Preis | [ ] |
| 2.1.6 | Add-ons auswählen | Preis wird aktualisiert | [ ] |

### 2.2 Quick-Check
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 2.2.1 | Quick-Check Standard anzeigen | Preis €99 | [ ] |
| 2.2.2 | Quick-Check Express anzeigen | Preis €149 | [ ] |

### 2.3 Mentoring
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 2.3.1 | Einzelsession anzeigen | Preis €149 | [ ] |
| 2.3.2 | 3er-Paket anzeigen | Preis €399 | [ ] |
| 2.3.3 | Komplettpaket anzeigen | Preis €699 | [ ] |

### 2.4 Warenkorb
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 2.4.1 | Produkt zum Warenkorb hinzufügen | Badge-Zähler aktualisiert sich | [ ] |
| 2.4.2 | Warenkorb öffnen | Produkte werden angezeigt | [ ] |
| 2.4.3 | Produkt aus Warenkorb entfernen | Produkt wird entfernt | [ ] |
| 2.4.4 | Warenkorb bleibt nach Seitenneuladen erhalten | LocalStorage funktioniert | [ ] |

---

## 3. Checkout & Bezahlung

### 3.1 Checkout-Prozess
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 3.1.1 | "Zur Kasse" klicken (nicht eingeloggt) | Login/Register Modal erscheint | [ ] |
| 3.1.2 | "Zur Kasse" klicken (eingeloggt) | Stripe Checkout öffnet sich | [ ] |
| 3.1.3 | Stripe Checkout abbrechen | Zurück zum Shop | [ ] |
| 3.1.4 | Testzahlung durchführen (4242 4242 4242 4242) | Erfolgsseite wird angezeigt | [ ] |

### 3.2 Nach erfolgreicher Zahlung
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 3.2.1 | Bestellung erscheint im Dashboard | Order mit Status "Bestätigt" | [ ] |
| 3.2.2 | Bestätigungs-Email erhalten | Email mit Rechnungs-PDF | [ ] |
| 3.2.3 | Admin sieht neue Bestellung | Order im Admin-Dashboard | [ ] |

---

## 4. Kunden-Dashboard

### 4.1 Bestellungsübersicht
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.1.1 | Dashboard aufrufen | Bestellungen werden geladen | [ ] |
| 4.1.2 | Tab "Aktiv" zeigt offene Bestellungen | Korrekte Filterung | [ ] |
| 4.1.3 | Tab "Abgeschlossen" zeigt fertige Bestellungen | Korrekte Filterung | [ ] |
| 4.1.4 | Bestellung aufklappen | Details werden angezeigt | [ ] |

### 4.2 CV-Erstellung Workflow
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.2.1 | Workflow zeigt "Fragebogen ausfüllen" | Schritt 1 aktiv | [ ] |
| 4.2.2 | Fragebogen-Link funktioniert | Fragebogen öffnet sich | [ ] |
| 4.2.3 | Nach Fragebogen-Absenden: Workflow aktualisiert | Schritt 2 "CV wird erstellt" | [ ] |
| 4.2.4 | Nach CV-Lieferung: Download-Button erscheint | Grüner Download-Button | [ ] |
| 4.2.5 | CV herunterladen | PDF wird heruntergeladen | [ ] |

### 4.3 Quick-Check Workflow
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.3.1 | Workflow zeigt "Dokumente hochladen" | Upload-Button sichtbar | [ ] |
| 4.3.2 | CV hochladen | Datei wird hochgeladen | [ ] |
| 4.3.3 | Nach Gutachten-Lieferung: Download-Button | Grüner Download-Button | [ ] |
| 4.3.4 | Bestellung in "Abgeschlossen" Tab | Korrekte Kategorisierung | [ ] |

### 4.4 Mentoring Workflow
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.4.1 | Terminvorschläge erhalten | 3 Optionen werden angezeigt | [ ] |
| 4.4.2 | Termin auswählen | Bestätigung wird angezeigt | [ ] |
| 4.4.3 | Termin ablehnen mit Begründung | Admin wird informiert | [ ] |
| 4.4.4 | Meeting beitreten (zur Terminzeit) | Daily.co Meeting öffnet sich | [ ] |

### 4.5 Handlungsbedarf Sidebar
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.5.1 | Offene Aktionen werden angezeigt | Korrekte Aufgabenliste | [ ] |
| 4.5.2 | Klick auf Aufgabe scrollt zur Bestellung | Bestellung wird hervorgehoben | [ ] |
| 4.5.3 | Abgeschlossene Orders haben keine Aufgaben | Keine Anzeige für fertige Orders | [ ] |

---

## 5. Admin-Dashboard

### 5.1 Bestellungsverwaltung
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.1.1 | Admin-Dashboard aufrufen | Bestellungen werden geladen | [ ] |
| 5.1.2 | Tab "Offen" zeigt aktive Bestellungen | Mit "Du bist dran" Badge | [ ] |
| 5.1.3 | Tab "Abgeschlossen" zeigt fertige Bestellungen | Mit "Erledigt" Badge | [ ] |
| 5.1.4 | Suche nach Kundenname | Filterung funktioniert | [ ] |
| 5.1.5 | Suche nach Email | Filterung funktioniert | [ ] |
| 5.1.6 | Status-Filter verwenden | Filterung funktioniert | [ ] |

### 5.2 CV-Bestellungen verwalten
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.2.1 | Fragebogen senden (neue Bestellung) | cvProject wird erstellt | [ ] |
| 5.2.2 | Fragebogen-Daten ansehen | Toggle zeigt Kundendaten | [ ] |
| 5.2.3 | CV hochladen & liefern | Datei wird hochgeladen | [ ] |
| 5.2.4 | Status wechselt zu "Abgeschlossen" | Order in "Abgeschlossen" Tab | [ ] |
| 5.2.5 | Kunde sieht Download-Button | Kunde kann CV herunterladen | [ ] |

### 5.3 Quick-Check verwalten
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.3.1 | Kunden-Upload sehen | Hochgeladenes Dokument sichtbar | [ ] |
| 5.3.2 | Gutachten hochladen | Datei wird hochgeladen | [ ] |
| 5.3.3 | Status wechselt zu "Abgeschlossen" | Order in "Abgeschlossen" Tab | [ ] |

### 5.4 Mentoring verwalten
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.4.1 | Coach zuweisen | Coach-Auswahl Modal öffnet sich | [ ] |
| 5.4.2 | Terminvorschläge senden | Email an Kunde wird gesendet | [ ] |
| 5.4.3 | Kunde wählt Termin: Admin sieht Bestätigung | Status aktualisiert sich | [ ] |
| 5.4.4 | Meeting beitreten (als Admin/Coach) | Daily.co Meeting funktioniert | [ ] |

### 5.5 Testbestellungen
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.5.1 | "Testbestellungen löschen" Button | Bestätigungs-Dialog erscheint | [ ] |
| 5.5.2 | Löschen bestätigen | Alle Orders werden gelöscht | [ ] |

---

## 6. Fragebogen

### 6.1 Fragebogen-Zugang
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 6.1.1 | Fragebogen über Link öffnen | Fragebogen wird geladen | [ ] |
| 6.1.2 | Fragebogen ohne gültiges Projekt | Fehlermeldung | [ ] |

### 6.2 Fragebogen ausfüllen
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 6.2.1 | Persönliche Daten eingeben | Felder werden gespeichert | [ ] |
| 6.2.2 | Berufserfahrung hinzufügen | Mehrere Einträge möglich | [ ] |
| 6.2.3 | Ausbildung hinzufügen | Mehrere Einträge möglich | [ ] |
| 6.2.4 | Dokumente hochladen | Upload funktioniert | [ ] |
| 6.2.5 | Template auswählen | Vorschau wird angezeigt | [ ] |
| 6.2.6 | Fragebogen absenden | Bestätigung erscheint | [ ] |

### 6.3 Template-Auswahl
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 6.3.1 | Templates werden angezeigt | Alle aktiven Templates sichtbar | [ ] |
| 6.3.2 | Template-Vorschau öffnen | Preview wird geladen | [ ] |
| 6.3.3 | Farben anpassen | Vorschau aktualisiert sich | [ ] |

---

## 7. Template Designer (Admin)

### 7.1 Designer aufrufen
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 7.1.1 | /template-designer aufrufen | Designer wird geladen | [ ] |
| 7.1.2 | Template auswählen | Template wird im Editor angezeigt | [ ] |

### 7.2 Template bearbeiten
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 7.2.1 | Textfelder bearbeiten | Änderungen werden übernommen | [ ] |
| 7.2.2 | Elemente verschieben | Drag & Drop funktioniert | [ ] |
| 7.2.3 | PDF generieren | PDF wird erstellt | [ ] |

---

## 8. E-Mail-Benachrichtigungen

### 8.1 Automatische Emails
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 8.1.1 | Bestellbestätigung | Email mit Rechnung | [ ] |
| 8.1.2 | Willkommens-Email (neuer Account) | Email mit Login-Daten | [ ] |
| 8.1.3 | Terminvorschläge an Kunde | Email mit 3 Optionen | [ ] |
| 8.1.4 | Dokument bereit für Kunde | Email mit Dashboard-Link | [ ] |
| 8.1.5 | Admin-Benachrichtigung bei neuer Bestellung | Email an Admin | [ ] |

---

## 9. Responsive Design & Mobile

### 9.1 Mobile Ansicht
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 9.1.1 | Startseite auf Mobile | Korrekte Darstellung | [ ] |
| 9.1.2 | Navigation (Hamburger-Menü) | Menü öffnet/schließt | [ ] |
| 9.1.3 | Warenkorb auf Mobile | Modal funktioniert | [ ] |
| 9.1.4 | Dashboard auf Mobile | Tabs funktionieren | [ ] |
| 9.1.5 | Fragebogen auf Mobile | Alle Felder nutzbar | [ ] |

---

## 10. Sicherheit & Edge Cases

### 10.1 Zugriffskontrolle
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 10.1.1 | Admin-Bereich ohne Admin-Login | Zugriff verweigert | [ ] |
| 10.1.2 | Fremde Bestellung aufrufen | Zugriff verweigert | [ ] |
| 10.1.3 | Fremdes cvProject öffnen | Zugriff verweigert | [ ] |

### 10.2 Fehlerbehandlung
| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 10.2.1 | Upload zu große Datei (>15MB) | Fehlermeldung | [ ] |
| 10.2.2 | Upload ungültiger Dateityp | Fehlermeldung | [ ] |
| 10.2.3 | Netzwerkfehler während Operation | Benutzerfreundliche Fehlermeldung | [ ] |

---

## Testergebnisse Zusammenfassung

| Bereich | Gesamt | Bestanden | Fehlgeschlagen | Nicht getestet |
|---------|--------|-----------|----------------|----------------|
| Authentifizierung | 11 | | | |
| Produkte & Warenkorb | 14 | | | |
| Checkout | 6 | | | |
| Kunden-Dashboard | 17 | | | |
| Admin-Dashboard | 16 | | | |
| Fragebogen | 11 | | | |
| Template Designer | 5 | | | |
| E-Mail | 5 | | | |
| Mobile | 5 | | | |
| Sicherheit | 5 | | | |
| **GESAMT** | **95** | | | |

---

## Gefundene Bugs

| # | Bereich | Beschreibung | Priorität | Status |
|---|---------|--------------|-----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Notizen

_Platz für zusätzliche Beobachtungen während des Tests_

