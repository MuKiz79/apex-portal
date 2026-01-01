import { useEffect, useState } from 'react';
import { generate } from '@pdfme/generator';
import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';
import { text, rectangle } from '@pdfme/schemas';

// Helper: Adjust color brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + (R * 0x10000) + (G * 0x100) + B).toString(16).slice(1);
}

// Helper: Get contrast color (black or white)
function getContrastColor(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xFF;
  const g = (num >> 8) & 0xFF;
  const b = num & 0xFF;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#333333' : '#ffffff';
}

// Build template with dynamic colors
const getTemplate = (primaryColor: string, accentColor: string): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // Header Background (Primary)
      {
        name: 'headerBg',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 85,
        color: primaryColor
      },
      // Photo area (darker primary)
      {
        name: 'photoBg',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 65,
        height: 85,
        color: adjustBrightness(primaryColor, -20)
      },
      // First Name
      {
        name: 'firstName',
        type: 'text',
        position: { x: 75, y: 18 },
        width: 125,
        height: 18,
        fontSize: 36,
        fontColor: '#ffffff'
      },
      // Last Name
      {
        name: 'lastName',
        type: 'text',
        position: { x: 75, y: 42 },
        width: 125,
        height: 18,
        fontSize: 36,
        fontColor: '#ffffff'
      },
      // Job Title
      {
        name: 'jobTitle',
        type: 'text',
        position: { x: 75, y: 65 },
        width: 125,
        height: 10,
        fontSize: 10,
        fontColor: '#cccccc'
      },
      // Contact Bar (Accent)
      {
        name: 'contactBar',
        type: 'rectangle',
        position: { x: 0, y: 85 },
        width: 210,
        height: 14,
        color: accentColor
      },
      // Phone
      {
        name: 'phone',
        type: 'text',
        position: { x: 12, y: 89 },
        width: 55,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },
      // Email
      {
        name: 'email',
        type: 'text',
        position: { x: 72, y: 89 },
        width: 65,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },
      // Address
      {
        name: 'address',
        type: 'text',
        position: { x: 142, y: 89 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },
      // Sidebar (Light version of accent)
      {
        name: 'sidebar',
        type: 'rectangle',
        position: { x: 0, y: 99 },
        width: 65,
        height: 198,
        color: adjustBrightness(accentColor, 60)
      },
      // Bildung Title
      {
        name: 'bildungTitle',
        type: 'text',
        position: { x: 8, y: 108 },
        width: 50,
        height: 8,
        fontSize: 10,
        fontColor: primaryColor
      },
      // Bildung Content
      {
        name: 'bildungContent',
        type: 'text',
        position: { x: 8, y: 120 },
        width: 50,
        height: 25,
        fontSize: 8,
        fontColor: '#444444'
      },
      // Skills Title
      {
        name: 'skillsTitle',
        type: 'text',
        position: { x: 8, y: 155 },
        width: 50,
        height: 8,
        fontSize: 10,
        fontColor: primaryColor
      },
      // Skills Content
      {
        name: 'skillsContent',
        type: 'text',
        position: { x: 8, y: 167 },
        width: 50,
        height: 30,
        fontSize: 8,
        fontColor: '#444444'
      },
      // Sprachen Title
      {
        name: 'sprachenTitle',
        type: 'text',
        position: { x: 8, y: 210 },
        width: 50,
        height: 8,
        fontSize: 10,
        fontColor: primaryColor
      },
      // Sprachen Content
      {
        name: 'sprachenContent',
        type: 'text',
        position: { x: 8, y: 222 },
        width: 50,
        height: 40,
        fontSize: 8,
        fontColor: '#444444'
      },
      // Experience Title
      {
        name: 'expTitle',
        type: 'text',
        position: { x: 72, y: 108 },
        width: 130,
        height: 10,
        fontSize: 10,
        fontColor: primaryColor
      },
      // Job 1 Date
      {
        name: 'job1Date',
        type: 'text',
        position: { x: 72, y: 125 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: accentColor
      },
      // Job 1 Title
      {
        name: 'job1Title',
        type: 'text',
        position: { x: 72, y: 133 },
        width: 130,
        height: 7,
        fontSize: 9,
        fontColor: '#222222'
      },
      // Job 1 Company
      {
        name: 'job1Company',
        type: 'text',
        position: { x: 72, y: 142 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Job 1 Description
      {
        name: 'job1Desc',
        type: 'text',
        position: { x: 72, y: 150 },
        width: 130,
        height: 18,
        fontSize: 8,
        fontColor: '#444444'
      },
      // Job 2 Date
      {
        name: 'job2Date',
        type: 'text',
        position: { x: 72, y: 175 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: accentColor
      },
      // Job 2 Title
      {
        name: 'job2Title',
        type: 'text',
        position: { x: 72, y: 183 },
        width: 130,
        height: 7,
        fontSize: 9,
        fontColor: '#222222'
      },
      // Job 2 Company
      {
        name: 'job2Company',
        type: 'text',
        position: { x: 72, y: 192 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Job 2 Description
      {
        name: 'job2Desc',
        type: 'text',
        position: { x: 72, y: 200 },
        width: 130,
        height: 18,
        fontSize: 8,
        fontColor: '#444444'
      },
      // Job 3 Date
      {
        name: 'job3Date',
        type: 'text',
        position: { x: 72, y: 225 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: accentColor
      },
      // Job 3 Title
      {
        name: 'job3Title',
        type: 'text',
        position: { x: 72, y: 233 },
        width: 130,
        height: 7,
        fontSize: 9,
        fontColor: '#222222'
      },
      // Job 3 Company
      {
        name: 'job3Company',
        type: 'text',
        position: { x: 72, y: 242 },
        width: 130,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      // Job 3 Description
      {
        name: 'job3Desc',
        type: 'text',
        position: { x: 72, y: 250 },
        width: 130,
        height: 18,
        fontSize: 8,
        fontColor: '#444444'
      }
    ]
  ]
});

// Sample data for preview
const sampleInputs = {
  firstName: 'LUKAS',
  lastName: 'BERGER',
  jobTitle: 'MARKETING MANAGER',
  phone: '(0221) 1234-56',
  email: 'hallo@beispiel.de',
  address: 'Musterstraße 123, 12345 Stadt',
  bildungTitle: 'BILDUNG',
  bildungContent: 'B. Sc. Marketing\nUniversität Beispiel\n2012 - 2015',
  skillsTitle: 'SKILLS',
  skillsContent: 'Teamleitung\nStrategie\nKampagnen\nKommunikation',
  sprachenTitle: 'SPRACHEN',
  sprachenContent: 'Deutsch - Muttersprache\nEnglisch - Fließend\nSpanisch - Grundkenntnisse',
  expTitle: 'BERUFSERFAHRUNG',
  job1Date: '05/2020 - HEUTE',
  job1Title: 'Marketing Manager',
  job1Company: 'Momoka GmbH',
  job1Desc: 'Leitung des Marketing-Teams mit Fokus auf digitale Strategien.',
  job2Date: '02/2018 - 04/2020',
  job2Title: 'Marketing Specialist',
  job2Company: 'Borcelle GmbH',
  job2Desc: 'Entwicklung von Online-Marketing Kampagnen.',
  job3Date: '09/2015 - 02/2018',
  job3Title: 'Marketing Assistant',
  job3Company: 'Borcelle GmbH',
  job3Desc: 'Unterstützung bei Marketing-Aktivitäten.'
};

function Preview() {
  const [primaryColor, setPrimaryColor] = useState('#1a3a5c');
  const [accentColor, setAccentColor] = useState('#d4912a');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate and render PDF
  const renderPreview = async (primary: string, accent: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const template = getTemplate(primary, accent);

      const pdf = await generate({
        template,
        inputs: [sampleInputs],
        plugins: { text, rectangle }
      });

      // Convert PDF to image using pdf.js or display as object
      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      // Update iframe or object element
      const pdfContainer = document.getElementById('pdf-preview');
      if (pdfContainer) {
        pdfContainer.setAttribute('data', url);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error generating preview:', err);
      setError('Fehler beim Generieren der Vorschau');
      setIsLoading(false);
    }
  };

  // Initial render
  useEffect(() => {
    renderPreview(primaryColor, accentColor);
  }, []);

  // Update when colors change
  useEffect(() => {
    renderPreview(primaryColor, accentColor);
  }, [primaryColor, accentColor]);

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('Preview received message:', event.data);
      if (event.data.type === 'updateColors') {
        if (event.data.primaryColor) {
          setPrimaryColor(event.data.primaryColor);
        }
        if (event.data.accentColor) {
          setAccentColor(event.data.accentColor);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify parent that preview is ready
    console.log('Preview sending ready message');
    window.parent.postMessage({ type: 'previewReady' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: '#e5e5e5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          Lade Vorschau...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#fee',
          padding: '20px',
          borderRadius: '8px',
          color: '#c00'
        }}>
          {error}
        </div>
      )}
      <object
        id="pdf-preview"
        type="application/pdf"
        style={{
          width: '100%',
          height: '100%',
          border: 'none'
        }}
      >
        <p>PDF Vorschau wird geladen...</p>
      </object>
      {/* Color indicator */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        display: 'flex',
        gap: '8px',
        background: 'white',
        padding: '8px 12px',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '16px', background: primaryColor, borderRadius: '3px' }}></div>
          <span>Primary</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '16px', background: accentColor, borderRadius: '3px' }}></div>
          <span>Accent</span>
        </div>
      </div>
    </div>
  );
}

export default Preview;
