import { useEffect, useRef, useState } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';
import { text, image, line, rectangle } from '@pdfme/schemas';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import './App.css';
import { getExecutiveCoverTemplate } from './templates/executiveCover';
import { getSchwarzBeigeModernTemplate } from './templates/schwarzBeigeModern';

// Firebase Config - same as main app
const firebaseConfig = {
  apiKey: "AIzaSyBL_6RUpxzfSj_X1z3Asd8pINjH5Gla7i0",
  authDomain: "apex-executive.firebaseapp.com",
  projectId: "apex-executive",
  storageBucket: "apex-executive.firebasestorage.app",
  messagingSenderId: "1090135207697",
  appId: "1:1090135207697:web:e2a93a98d88c03feef67a2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Schwarz Beige Modern CV Template - Muammer Kizilaslan
const getDefaultTemplate = (): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // Header Background
      {
        name: 'headerBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 85,
        color: '#2d2d2d'
      },
      // Photo placeholder
      {
        name: 'photoPlaceholder',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 65,
        height: 85,
        color: '#1a1a1a'
      },
      // First Name
      {
        name: 'firstName',
        type: 'text',
        position: { x: 75, y: 20 },
        width: 125,
        height: 15,
        fontSize: 36,
        fontColor: '#ffffff'
      },
      // Last Name
      {
        name: 'lastName',
        type: 'text',
        position: { x: 75, y: 40 },
        width: 125,
        height: 15,
        fontSize: 36,
        fontColor: '#ffffff'
      },
      // Job Title
      {
        name: 'jobTitle',
        type: 'text',
        position: { x: 75, y: 62 },
        width: 125,
        height: 10,
        fontSize: 10,
        fontColor: '#b0b0b0'
      },
      // Contact Bar
      {
        name: 'contactBar',
        type: 'rectangle',
        position: { x: 0, y: 85 },
        width: 210,
        height: 12,
        color: '#f5f5f5'
      },
      // Contact Phone
      {
        name: 'contactPhone',
        type: 'text',
        position: { x: 10, y: 88 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Contact Email
      {
        name: 'contactEmail',
        type: 'text',
        position: { x: 65, y: 88 },
        width: 75,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Contact Address
      {
        name: 'contactAddress',
        type: 'text',
        position: { x: 145, y: 88 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Sidebar Background
      {
        name: 'sidebarBackground',
        type: 'rectangle',
        position: { x: 0, y: 97 },
        width: 65,
        height: 200,
        color: '#f8f6f3'
      },
      // BILDUNG Title
      {
        name: 'bildungTitle',
        type: 'text',
        position: { x: 5, y: 105 },
        width: 55,
        height: 8,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      // Bildung Content
      {
        name: 'bildungContent',
        type: 'text',
        position: { x: 5, y: 116 },
        width: 55,
        height: 20,
        fontSize: 8,
        fontColor: '#666666'
      },
      // SKILLS Title
      {
        name: 'skillsTitle',
        type: 'text',
        position: { x: 5, y: 145 },
        width: 55,
        height: 8,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      // Skills Content
      {
        name: 'skillsContent',
        type: 'text',
        position: { x: 5, y: 156 },
        width: 55,
        height: 35,
        fontSize: 8,
        fontColor: '#666666'
      },
      // SPRACHEN Title
      {
        name: 'sprachenTitle',
        type: 'text',
        position: { x: 5, y: 200 },
        width: 55,
        height: 8,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      // Sprachen Content
      {
        name: 'sprachenContent',
        type: 'text',
        position: { x: 5, y: 211 },
        width: 55,
        height: 50,
        fontSize: 8,
        fontColor: '#666666'
      },
      // BERUFSERFAHRUNG Title
      {
        name: 'experienceTitle',
        type: 'text',
        position: { x: 72, y: 105 },
        width: 130,
        height: 8,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      // Experience Content
      {
        name: 'experienceContent',
        type: 'text',
        position: { x: 72, y: 118 },
        width: 130,
        height: 160,
        fontSize: 8,
        fontColor: '#444444'
      }
    ]
  ]
});

interface SavedTemplate {
  id: string;
  name: string;
  template: Template;
  createdAt: Date;
  updatedAt: Date;
}

// SVG Template color configuration
const SVG_COLORS = {
  primary: '#b76e22',   // Bronze - Job title, section headers, bottom shapes
  accent: '#8fa3b4',    // Blue-gray - Photo circle, contact icons
  circle: '#f4b4b7'     // Pink - Large decorative circle
};

function App() {
  const designerRef = useRef<HTMLDivElement>(null);
  const designerInstance = useRef<Designer | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [currentTemplateName, setCurrentTemplateName] = useState('Neues Template');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // SVG Preview state
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState(SVG_COLORS.primary);
  const [accentColor, setAccentColor] = useState(SVG_COLORS.accent);
  const [circleColor, setCircleColor] = useState(SVG_COLORS.circle);
  const [svgLoading, setSvgLoading] = useState(false);
  const [showSvgPreview, setShowSvgPreview] = useState(false);

  // Load and process SVG with color replacement
  const loadSvgPreview = async () => {
    setSvgLoading(true);
    try {
      const response = await fetch('/template-designer/template-kreativ.svg?t=' + Date.now());
      if (!response.ok) throw new Error('SVG nicht gefunden');

      let svgText = await response.text();

      // Replace colors
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.primary), 'gi'), primaryColor);
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.accent), 'gi'), accentColor);
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.circle), 'gi'), circleColor);

      // Convert to data URL
      const base64 = btoa(unescape(encodeURIComponent(svgText)));
      setSvgPreviewUrl('data:image/svg+xml;base64,' + base64);
    } catch (error) {
      console.error('Error loading SVG:', error);
      showMessage('Fehler beim Laden der SVG-Vorschau', 'error');
    } finally {
      setSvgLoading(false);
    }
  };

  // Load SVG when colors change or preview is shown
  useEffect(() => {
    if (showSvgPreview) {
      loadSvgPreview();
    }
  }, [showSvgPreview, primaryColor, accentColor, circleColor]);

  // Reset SVG colors to defaults
  const resetSvgColors = () => {
    setPrimaryColor(SVG_COLORS.primary);
    setAccentColor(SVG_COLORS.accent);
    setCircleColor(SVG_COLORS.circle);
  };

  // Create pdfme template from SVG with custom colors
  const createTemplateFromSvg = async () => {
    if (!designerInstance.current) return;

    setSvgLoading(true);
    showMessage('Konvertiere SVG zu Template...', 'success');

    try {
      // 1. Load SVG and replace colors
      const response = await fetch('/template-designer/template-kreativ.svg?t=' + Date.now());
      if (!response.ok) throw new Error('SVG nicht gefunden');

      let svgText = await response.text();

      // Replace colors
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.primary), 'gi'), primaryColor);
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.accent), 'gi'), accentColor);
      svgText = svgText.replace(new RegExp(escapeRegex(SVG_COLORS.circle), 'gi'), circleColor);

      // 2. Parse SVG as DOM element
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;

      // Get SVG dimensions
      const svgWidth = parseFloat(svgElement.getAttribute('width') || '595');
      const svgHeight = parseFloat(svgElement.getAttribute('height') || '842');

      // 3. Create PDF (A4)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // 4. Convert SVG to PDF
      await pdf.svg(svgElement, {
        x: 0,
        y: 0,
        width: 210,
        height: (svgHeight / svgWidth) * 210 // Maintain aspect ratio
      });

      // 5. Get PDF as Base64
      const pdfBase64 = pdf.output('datauristring');

      // 6. Create template with predefined schemas for "Kreativ" template
      const template: Template = {
        basePdf: pdfBase64,
        schemas: [[
          // Name area (top right)
          {
            name: 'vorname',
            type: 'text',
            position: { x: 75, y: 32 },
            width: 120,
            height: 15,
            fontSize: 32,
            fontColor: '#000000'
          },
          {
            name: 'nachname',
            type: 'text',
            position: { x: 75, y: 50 },
            width: 120,
            height: 15,
            fontSize: 32,
            fontColor: '#000000'
          },
          {
            name: 'jobTitle',
            type: 'text',
            position: { x: 75, y: 68 },
            width: 120,
            height: 10,
            fontSize: 14,
            fontColor: primaryColor
          },
          // Contact section (bottom left)
          {
            name: 'email',
            type: 'text',
            position: { x: 25, y: 235 },
            width: 55,
            height: 6,
            fontSize: 9,
            fontColor: '#333333'
          },
          {
            name: 'telefon',
            type: 'text',
            position: { x: 25, y: 243 },
            width: 55,
            height: 6,
            fontSize: 9,
            fontColor: '#333333'
          },
          {
            name: 'adresse',
            type: 'text',
            position: { x: 25, y: 251 },
            width: 55,
            height: 6,
            fontSize: 9,
            fontColor: '#333333'
          },
          // Profile section
          {
            name: 'profilTitel',
            type: 'text',
            position: { x: 85, y: 95 },
            width: 110,
            height: 8,
            fontSize: 12,
            fontColor: primaryColor
          },
          {
            name: 'profilText',
            type: 'text',
            position: { x: 85, y: 105 },
            width: 110,
            height: 35,
            fontSize: 9,
            fontColor: '#333333'
          },
          // Experience section
          {
            name: 'erfahrungTitel',
            type: 'text',
            position: { x: 85, y: 145 },
            width: 110,
            height: 8,
            fontSize: 12,
            fontColor: primaryColor
          },
          {
            name: 'erfahrung1',
            type: 'text',
            position: { x: 85, y: 155 },
            width: 110,
            height: 30,
            fontSize: 9,
            fontColor: '#333333'
          },
          {
            name: 'erfahrung2',
            type: 'text',
            position: { x: 85, y: 190 },
            width: 110,
            height: 30,
            fontSize: 9,
            fontColor: '#333333'
          },
          // Left sidebar - Education
          {
            name: 'bildungTitel',
            type: 'text',
            position: { x: 15, y: 95 },
            width: 50,
            height: 8,
            fontSize: 10,
            fontColor: primaryColor
          },
          {
            name: 'bildung',
            type: 'text',
            position: { x: 15, y: 105 },
            width: 50,
            height: 30,
            fontSize: 8,
            fontColor: '#333333'
          },
          // Left sidebar - Skills
          {
            name: 'skillsTitel',
            type: 'text',
            position: { x: 15, y: 140 },
            width: 50,
            height: 8,
            fontSize: 10,
            fontColor: primaryColor
          },
          {
            name: 'skills',
            type: 'text',
            position: { x: 15, y: 150 },
            width: 50,
            height: 35,
            fontSize: 8,
            fontColor: '#333333'
          },
          // Left sidebar - Languages
          {
            name: 'sprachenTitel',
            type: 'text',
            position: { x: 15, y: 190 },
            width: 50,
            height: 8,
            fontSize: 10,
            fontColor: primaryColor
          },
          {
            name: 'sprachen',
            type: 'text',
            position: { x: 15, y: 200 },
            width: 50,
            height: 25,
            fontSize: 8,
            fontColor: '#333333'
          }
        ]]
      };

      // 7. Load template into designer
      designerInstance.current.updateTemplate(template);
      setCurrentTemplateName('Kreativ Template');
      setShowSvgPreview(false);
      showMessage('Template erfolgreich erstellt! Felder können jetzt bearbeitet werden.', 'success');

    } catch (error) {
      console.error('Error creating template from SVG:', error);
      showMessage('Fehler beim Erstellen des Templates: ' + (error as Error).message, 'error');
    } finally {
      setSvgLoading(false);
    }
  };

  // Load saved templates from Firestore
  const loadTemplatesFromFirestore = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'cvTemplates'));
      const templates: SavedTemplate[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        templates.push({
          id: doc.id,
          name: data.name,
          template: data.template,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        });
      });
      setSavedTemplates(templates);
    } catch (error) {
      console.error('Error loading templates:', error);
      showMessage('Fehler beim Laden der Templates', 'error');
    }
  };

  // Initialize Designer
  useEffect(() => {
    if (designerRef.current && !designerInstance.current) {
      const template = getDefaultTemplate();

      designerInstance.current = new Designer({
        domContainer: designerRef.current,
        template,
        plugins: { text, image, line, rectangle }
      });

      loadTemplatesFromFirestore();
    }

    return () => {
      if (designerInstance.current) {
        designerInstance.current.destroy();
        designerInstance.current = null;
      }
    };
  }, []);

  const showMessage = (msg: string, _type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Save template to Firestore
  const saveTemplate = async () => {
    if (!designerInstance.current) return;

    setIsLoading(true);
    try {
      const template = designerInstance.current.getTemplate();
      const templateId = currentTemplateName.toLowerCase().replace(/\s+/g, '-');

      await setDoc(doc(db, 'cvTemplates', templateId), {
        name: currentTemplateName,
        template: JSON.parse(JSON.stringify(template)),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      showMessage(`Template "${currentTemplateName}" gespeichert!`, 'success');
      loadTemplatesFromFirestore();
    } catch (error) {
      console.error('Error saving template:', error);
      showMessage('Fehler beim Speichern', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Load template into Designer
  const loadTemplate = (savedTemplate: SavedTemplate) => {
    if (!designerInstance.current) return;

    try {
      designerInstance.current.updateTemplate(savedTemplate.template);
      setCurrentTemplateName(savedTemplate.name);
      showMessage(`Template "${savedTemplate.name}" geladen!`, 'success');
    } catch (error) {
      console.error('Error loading template:', error);
      showMessage('Fehler beim Laden', 'error');
    }
  };

  // Delete template from Firestore
  const deleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`Template "${templateName}" wirklich löschen?`)) return;

    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'cvTemplates', templateId));
      showMessage(`Template "${templateName}" gelöscht!`, 'success');
      loadTemplatesFromFirestore();
    } catch (error) {
      console.error('Error deleting template:', error);
      showMessage('Fehler beim Löschen', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to default template
  const resetTemplate = () => {
    if (!designerInstance.current) return;
    if (!confirm('Template auf Standard zurücksetzen?')) return;

    designerInstance.current.updateTemplate(getDefaultTemplate());
    setCurrentTemplateName('Neues Template');
    showMessage('Template zurückgesetzt!', 'success');
  };

  // Load Executive Cover template
  const loadExecutiveCover = () => {
    if (!designerInstance.current) return;

    designerInstance.current.updateTemplate(getExecutiveCoverTemplate());
    setCurrentTemplateName('Executive Cover');
    showMessage('Executive Cover Template geladen!', 'success');
  };

  // Load Schwarz Beige Modern template
  const loadSchwarzBeigeModern = () => {
    if (!designerInstance.current) return;

    designerInstance.current.updateTemplate(getSchwarzBeigeModernTemplate());
    setCurrentTemplateName('Schwarz Beige Modern');
    showMessage('Schwarz Beige Modern Template geladen!', 'success');
  };

  // Export template as JSON
  const exportTemplate = () => {
    if (!designerInstance.current) return;

    const template = designerInstance.current.getTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTemplateName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Template exportiert!', 'success');
  };

  // Import template from JSON
  const importTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !designerInstance.current) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = JSON.parse(e.target?.result as string);
        designerInstance.current?.updateTemplate(template);
        setCurrentTemplateName(file.name.replace('.json', ''));
        showMessage('Template importiert!', 'success');
      } catch (error) {
        showMessage('Ungültige Template-Datei', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Load PDF as base template
  const loadBasePdf = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !designerInstance.current) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const base64 = e.target?.result as string;
        const currentTemplate = designerInstance.current?.getTemplate();

        // Create new template with the PDF as base
        const newTemplate: Template = {
          basePdf: base64,
          schemas: currentTemplate?.schemas || [[]]
        };

        designerInstance.current?.updateTemplate(newTemplate);
        setCurrentTemplateName(file.name.replace('.pdf', ''));
        showMessage('PDF als Basis geladen! Jetzt Felder hinzufügen.', 'success');
      } catch (error) {
        console.error('Error loading PDF:', error);
        showMessage('Fehler beim Laden der PDF', 'error');
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>APEX CV Template Designer</h1>
          <input
            type="text"
            value={currentTemplateName}
            onChange={(e) => setCurrentTemplateName(e.target.value)}
            className="template-name-input"
            placeholder="Template Name"
          />
        </div>
        <div className="header-actions">
          <button onClick={saveTemplate} disabled={isLoading} className="btn btn-primary">
            {isLoading ? 'Speichern...' : 'Speichern'}
          </button>
          <button onClick={exportTemplate} className="btn btn-secondary">
            Export JSON
          </button>
          <label className="btn btn-secondary">
            Import JSON
            <input type="file" accept=".json" onChange={importTemplate} hidden />
          </label>
          <label className="btn btn-primary" style={{ backgroundColor: '#059669' }}>
            📄 PDF hochladen
            <input type="file" accept=".pdf" onChange={loadBasePdf} hidden />
          </label>
          <button onClick={resetTemplate} className="btn btn-danger">
            Zurücksetzen
          </button>
        </div>
      </header>

      {/* Message Toast */}
      {message && (
        <div className={`toast ${message.includes('Fehler') ? 'toast-error' : 'toast-success'}`}>
          {message}
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar with saved templates */}
        <aside className="sidebar">
          {/* SVG Preview Section */}
          <h3>
            <button
              onClick={() => setShowSvgPreview(!showSvgPreview)}
              className="btn btn-template"
              style={{ width: '100%', marginBottom: '10px' }}
            >
              🎨 SVG-Vorschau {showSvgPreview ? '▼' : '▶'}
            </button>
          </h3>

          {showSvgPreview && (
            <div className="svg-preview-section">
              {/* Color Pickers */}
              <div className="color-picker-group">
                <label>
                  <span>Primary (Bronze)</span>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                </label>
                <label>
                  <span>Accent (Blau-Grau)</span>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </label>
                <label>
                  <span>Circle (Rosa)</span>
                  <input
                    type="color"
                    value={circleColor}
                    onChange={(e) => setCircleColor(e.target.value)}
                  />
                </label>
                <button onClick={resetSvgColors} className="btn btn-small">
                  Farben zurücksetzen
                </button>
              </div>

              {/* Create Template Button */}
              <button
                onClick={createTemplateFromSvg}
                className="btn btn-primary"
                disabled={svgLoading}
                style={{ width: '100%', marginBottom: '15px' }}
              >
                {svgLoading ? 'Konvertiere...' : '✨ Als Template laden'}
              </button>

              {/* SVG Preview */}
              <div className="svg-preview-container">
                {svgLoading ? (
                  <div className="svg-loading">Lade Vorschau...</div>
                ) : svgPreviewUrl ? (
                  <img
                    src={svgPreviewUrl}
                    alt="Template Vorschau"
                    className="svg-preview-image"
                  />
                ) : (
                  <div className="svg-loading">Klicken Sie auf eine Farbe</div>
                )}
              </div>
            </div>
          )}

          <h3>Basis-Templates</h3>
          <div className="base-templates">
            <button onClick={loadSchwarzBeigeModern} className="btn btn-template">
              📄 Schwarz Beige Modern
            </button>
            <button onClick={loadExecutiveCover} className="btn btn-template">
              📋 Executive Cover
            </button>
            <button onClick={resetTemplate} className="btn btn-template btn-template-secondary">
              🔄 Standard Template
            </button>
          </div>

          <h3>Gespeicherte Templates</h3>
          <div className="template-list">
            {savedTemplates.length === 0 ? (
              <p className="no-templates">Keine Templates gespeichert</p>
            ) : (
              savedTemplates.map((t) => (
                <div key={t.id} className="template-item">
                  <div className="template-info" onClick={() => loadTemplate(t)}>
                    <span className="template-name">{t.name}</span>
                    <span className="template-date">
                      {t.updatedAt.toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTemplate(t.id, t.name);
                    }}
                    className="btn-delete"
                    title="Löschen"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Designer Container */}
        <div className="designer-container" ref={designerRef} />
      </div>
    </div>
  );
}

export default App;
