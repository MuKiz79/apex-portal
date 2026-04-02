// Karriaro i18n - Einfaches Mehrsprachigkeitssystem
// Unterstützt: de (Standard), en

let currentLocale = 'de';
let translations = {};
let loadedLocales = {};

// Locale aus localStorage laden oder Browser-Sprache erkennen
function detectLocale() {
    const saved = localStorage.getItem('karriaro-locale');
    if (saved && ['de', 'en', 'tr'].includes(saved)) return saved;

    const browserLang = navigator.language?.split('-')[0];
    return ['de', 'en', 'tr'].includes(browserLang) ? browserLang : 'de';
}

// Locale-Datei laden
async function loadLocale(locale) {
    if (loadedLocales[locale]) {
        translations = loadedLocales[locale];
        return;
    }

    try {
        const response = await fetch(`/locales/${locale}.json`);
        if (!response.ok) throw new Error(`Locale ${locale} nicht gefunden`);
        loadedLocales[locale] = await response.json();
        translations = loadedLocales[locale];
    } catch (e) {
        console.warn(`[i18n] Locale '${locale}' konnte nicht geladen werden, Fallback auf 'de'`);
        if (locale !== 'de' && loadedLocales['de']) {
            translations = loadedLocales['de'];
        }
    }
}

// Übersetzungsfunktion: t('nav.home') → "Startseite" / "Home"
export function t(key, params = {}) {
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Key nicht gefunden → Key selbst zurückgeben (Debug-Hilfe)
            return key;
        }
    }

    if (typeof value !== 'string') return key;

    // Parameter ersetzen: t('greeting', { name: 'Max' }) → "Hallo Max"
    return value.replace(/\{\{(\w+)\}\}/g, (_, param) => params[param] ?? `{{${param}}}`);
}

// Sprache wechseln und DOM aktualisieren
export async function setLocale(locale) {
    if (!['de', 'en', 'tr'].includes(locale)) return;

    currentLocale = locale;
    localStorage.setItem('karriaro-locale', locale);
    await loadLocale(locale);
    applyTranslations();

    // HTML lang-Attribut aktualisieren
    document.documentElement.lang = locale;
}

// Aktuelle Sprache abfragen
export function getLocale() {
    return currentLocale;
}

// DOM-Elemente mit data-i18n Attribut übersetzen
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated !== key) {
            el.textContent = translated;
        }
    });

    // Placeholder-Attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = t(key);
        if (translated !== key) {
            el.setAttribute('placeholder', translated);
        }
    });

    // Title-Attribute
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        const translated = t(key);
        if (translated !== key) {
            el.setAttribute('title', translated);
        }
    });

    // HTML-Inhalte (für Elemente mit verschachteltem HTML)
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.getAttribute('data-i18n-html');
        const translated = t(key);
        if (translated !== key) {
            el.innerHTML = translated;
        }
    });
}

// Initialisierung
export async function initI18n() {
    currentLocale = detectLocale();
    await loadLocale(currentLocale);
    applyTranslations();
}
