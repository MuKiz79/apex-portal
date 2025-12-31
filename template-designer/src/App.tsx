import { useEffect, useRef, useState } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';
import { text, image, line, rectangle } from '@pdfme/schemas';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import './App.css';

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

// Default CV Template
const getDefaultTemplate = (): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // Header Section
      {
        name: 'headerBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 45,
        color: '#2c3e50'
      },
      {
        name: 'fullName',
        type: 'text',
        position: { x: 15, y: 12 },
        width: 180,
        height: 12,
        fontSize: 28,
        fontColor: '#ffffff',
        alignment: 'left',
        content: 'Max Mustermann'
      },
      {
        name: 'jobTitle',
        type: 'text',
        position: { x: 15, y: 28 },
        width: 180,
        height: 8,
        fontSize: 14,
        fontColor: '#ecf0f1',
        alignment: 'left',
        content: 'Senior Project Manager'
      },
      // Contact Info
      {
        name: 'contactInfo',
        type: 'text',
        position: { x: 15, y: 52 },
        width: 180,
        height: 6,
        fontSize: 10,
        fontColor: '#7f8c8d',
        alignment: 'left',
        content: 'max@email.de | +49 170 1234567 | München, Deutschland'
      },
      // Divider
      {
        name: 'divider1',
        type: 'line',
        position: { x: 15, y: 62 },
        width: 180,
        height: 0.5,
        color: '#bdc3c7'
      },
      // Profile Section
      {
        name: 'profileTitle',
        type: 'text',
        position: { x: 15, y: 68 },
        width: 50,
        height: 7,
        fontSize: 12,
        fontColor: '#2c3e50',
        fontName: 'Helvetica-Bold',
        content: 'PROFIL'
      },
      {
        name: 'profileText',
        type: 'text',
        position: { x: 15, y: 78 },
        width: 180,
        height: 25,
        fontSize: 10,
        fontColor: '#34495e',
        lineHeight: 1.4,
        content: 'Erfahrener Projektmanager mit über 7 Jahren Expertise in der Leitung komplexer IT-Projekte. Spezialisiert auf agile Methoden und digitale Transformation.'
      },
      // Experience Section
      {
        name: 'experienceTitle',
        type: 'text',
        position: { x: 15, y: 110 },
        width: 80,
        height: 7,
        fontSize: 12,
        fontColor: '#2c3e50',
        fontName: 'Helvetica-Bold',
        content: 'BERUFSERFAHRUNG'
      },
      {
        name: 'experience1',
        type: 'text',
        position: { x: 15, y: 120 },
        width: 180,
        height: 40,
        fontSize: 10,
        fontColor: '#34495e',
        lineHeight: 1.4,
        content: 'Senior Project Lead | Tech Solutions GmbH | 2021 - heute\n• Leitung eines Teams von 12 Entwicklern\n• Steigerung der Projektabschlussrate um 35%\n• Implementierung von Scrum-Prozessen'
      },
      // Education Section
      {
        name: 'educationTitle',
        type: 'text',
        position: { x: 15, y: 165 },
        width: 50,
        height: 7,
        fontSize: 12,
        fontColor: '#2c3e50',
        fontName: 'Helvetica-Bold',
        content: 'AUSBILDUNG'
      },
      {
        name: 'education1',
        type: 'text',
        position: { x: 15, y: 175 },
        width: 180,
        height: 20,
        fontSize: 10,
        fontColor: '#34495e',
        lineHeight: 1.4,
        content: 'Master of Science, Informatik | TU München | 2014 - 2016\nBachelor of Science, Wirtschaftsinformatik | LMU München | 2011 - 2014'
      },
      // Skills Section
      {
        name: 'skillsTitle',
        type: 'text',
        position: { x: 15, y: 200 },
        width: 50,
        height: 7,
        fontSize: 12,
        fontColor: '#2c3e50',
        fontName: 'Helvetica-Bold',
        content: 'SKILLS'
      },
      {
        name: 'skillsText',
        type: 'text',
        position: { x: 15, y: 210 },
        width: 180,
        height: 15,
        fontSize: 10,
        fontColor: '#34495e',
        content: 'Projektmanagement • Scrum/Agile • Python • JavaScript • SQL • Jira • Confluence'
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
