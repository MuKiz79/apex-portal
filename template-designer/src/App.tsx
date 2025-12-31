import { useEffect, useRef, useState } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';
import { text, image, line, rectangle } from '@pdfme/schemas';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import './App.css';
import { getExecutiveCoverTemplate } from './templates/executiveCover';

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

function App() {
  const designerRef = useRef<HTMLDivElement>(null);
  const designerInstance = useRef<Designer | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [currentTemplateName, setCurrentTemplateName] = useState('Neues Template');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

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
          <h3>Basis-Templates</h3>
          <div className="base-templates">
            <button onClick={resetTemplate} className="btn btn-template">
              📄 CV Template
            </button>
            <button onClick={loadExecutiveCover} className="btn btn-template">
              📋 Executive Cover
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
