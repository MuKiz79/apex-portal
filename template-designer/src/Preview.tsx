import { useEffect, useRef, useState } from 'react';
import { Viewer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';
import { text, image, rectangle } from '@pdfme/schemas';

// Schwarz Beige Modern CV Template with dynamic colors
const getTemplate = (primaryColor: string, accentColor: string): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // ============ HEADER SECTION (Primary Color) ============
      {
        name: 'headerBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 85,
        color: primaryColor
      },
      // Photo area (slightly darker)
      {
        name: 'photoBackground',
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
        position: { x: 75, y: 15 },
        width: 125,
        height: 18,
        fontSize: 42,
        fontColor: '#ffffff',
        characterSpacing: 8
      },
      // Last Name
      {
        name: 'lastName',
        type: 'text',
        position: { x: 75, y: 38 },
        width: 125,
        height: 18,
        fontSize: 42,
        fontColor: '#ffffff',
        characterSpacing: 8
      },
      // Job Title
      {
        name: 'jobTitle',
        type: 'text',
        position: { x: 75, y: 62 },
        width: 125,
        height: 10,
        fontSize: 10,
        fontColor: '#a0a0a0',
        characterSpacing: 4
      },

      // ============ CONTACT BAR (Accent Color) ============
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
        position: { x: 15, y: 89 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },
      // Email
      {
        name: 'email',
        type: 'text',
        position: { x: 75, y: 89 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },
      // Address
      {
        name: 'address',
        type: 'text',
        position: { x: 145, y: 89 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: getContrastColor(accentColor)
      },

      // ============ LEFT SIDEBAR ============
      {
        name: 'sidebarBackground',
        type: 'rectangle',
        position: { x: 0, y: 99 },
        width: 65,
        height: 198,
        color: adjustBrightness(accentColor, 40) // Lighter version of accent
      },

      // --- BILDUNG Section ---
      {
        name: 'bildungTitle',
        type: 'text',
        position: { x: 8, y: 110 },
        width: 50,
        height: 8,
        fontSize: 11,
        fontColor: primaryColor,
        characterSpacing: 2
      },
      {
        name: 'bildungDegree',
        type: 'text',
        position: { x: 8, y: 125 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d'
      },
      {
        name: 'bildungSchool',
        type: 'text',
        position: { x: 8, y: 133 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },
      {
        name: 'bildungYears',
        type: 'text',
        position: { x: 8, y: 141 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#666666'
      },

      // --- SKILLS Section ---
      {
        name: 'skillsTitle',
        type: 'text',
        position: { x: 8, y: 160 },
        width: 50,
        height: 8,
        fontSize: 11,
        fontColor: primaryColor,
        characterSpacing: 2
      },
      {
        name: 'skill1',
        type: 'text',
        position: { x: 8, y: 175 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'skill2',
        type: 'text',
        position: { x: 8, y: 184 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'skill3',
        type: 'text',
        position: { x: 8, y: 193 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'skill4',
        type: 'text',
        position: { x: 8, y: 202 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },

      // --- SPRACHEN Section ---
      {
        name: 'sprachenTitle',
        type: 'text',
        position: { x: 8, y: 220 },
        width: 50,
        height: 8,
        fontSize: 11,
        fontColor: primaryColor,
        characterSpacing: 2
      },
      {
        name: 'sprache1',
        type: 'text',
        position: { x: 8, y: 235 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d'
      },
      {
        name: 'sprache1Level',
        type: 'text',
        position: { x: 8, y: 242 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: accentColor
      },
      {
        name: 'sprache2',
        type: 'text',
        position: { x: 8, y: 254 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d'
      },
      {
        name: 'sprache2Level',
        type: 'text',
        position: { x: 8, y: 261 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: accentColor
      },

      // ============ MAIN CONTENT (Right side) ============
      {
        name: 'experienceTitle',
        type: 'text',
        position: { x: 75, y: 110 },
        width: 125,
        height: 10,
        fontSize: 11,
        fontColor: primaryColor,
        characterSpacing: 2
      },

      // --- Job 1 ---
      {
        name: 'job1Date',
        type: 'text',
        position: { x: 75, y: 128 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: accentColor,
        characterSpacing: 1
      },
      {
        name: 'job1Title',
        type: 'text',
        position: { x: 75, y: 136 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      {
        name: 'job1Company',
        type: 'text',
        position: { x: 75, y: 144 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'job1Description',
        type: 'text',
        position: { x: 75, y: 153 },
        width: 125,
        height: 22,
        fontSize: 9,
        fontColor: '#444444'
      },

      // --- Job 2 ---
      {
        name: 'job2Date',
        type: 'text',
        position: { x: 75, y: 182 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: accentColor,
        characterSpacing: 1
      },
      {
        name: 'job2Title',
        type: 'text',
        position: { x: 75, y: 190 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      {
        name: 'job2Company',
        type: 'text',
        position: { x: 75, y: 198 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'job2Description',
        type: 'text',
        position: { x: 75, y: 207 },
        width: 125,
        height: 16,
        fontSize: 9,
        fontColor: '#444444'
      },

      // --- Job 3 ---
      {
        name: 'job3Date',
        type: 'text',
        position: { x: 75, y: 230 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: accentColor,
        characterSpacing: 1
      },
      {
        name: 'job3Title',
        type: 'text',
        position: { x: 75, y: 238 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d'
      },
      {
        name: 'job3Company',
        type: 'text',
        position: { x: 75, y: 246 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666'
      },
      {
        name: 'job3Description',
        type: 'text',
        position: { x: 75, y: 255 },
        width: 125,
        height: 20,
        fontSize: 9,
        fontColor: '#444444'
      }
    ]
  ]
});

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

// Sample data for preview
const sampleInputs = {
  firstName: 'LUKAS',
  lastName: 'BERGER',
  jobTitle: 'M A R K E T I N G   M A N A G E R',
  phone: '(0221) 1234-56',
  email: 'hallo@beispiel.de',
  address: 'Jede Straße 123, 12345 Stadt',
  bildungTitle: 'B I L D U N G',
  bildungDegree: 'B. Sc. Marketing',
  bildungSchool: 'Universität Beispiel',
  bildungYears: '2012 - 2015',
  skillsTitle: 'S K I L L S',
  skill1: 'Teamleitung',
  skill2: 'Strategie',
  skill3: 'Kampagnen',
  skill4: 'Kommunikation',
  sprachenTitle: 'S P R A C H E N',
  sprache1: 'Deutsch',
  sprache1Level: 'Muttersprache',
  sprache2: 'Englisch',
  sprache2Level: 'Fließend',
  experienceTitle: 'B E R U F S E R F A H R U N G',
  job1Date: '05/2020 - HEUTE',
  job1Title: 'MARKETING MANAGER',
  job1Company: 'Momoka GmbH',
  job1Description: 'Leitung des Marketing-Teams mit Fokus auf digitale Strategien und Kampagnenentwicklung.',
  job2Date: '02/2018 - 04/2020',
  job2Title: 'MARKETING SPECIALIST',
  job2Company: 'Borcelle GmbH',
  job2Description: 'Entwicklung und Umsetzung von Online-Marketing Kampagnen.',
  job3Date: '09/2015 - 02/2018',
  job3Title: 'MARKETING ASSISTANT',
  job3Company: 'Borcelle GmbH',
  job3Description: 'Unterstützung bei der Planung und Durchführung von Marketing-Aktivitäten.'
};

function Preview() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<Viewer | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1a3a5c');
  const [accentColor, setAccentColor] = useState('#d4912a');

  // Initialize Viewer
  useEffect(() => {
    if (viewerRef.current && !viewerInstance.current) {
      const template = getTemplate(primaryColor, accentColor);

      viewerInstance.current = new Viewer({
        domContainer: viewerRef.current,
        template,
        inputs: [sampleInputs],
        plugins: { text, image, rectangle }
      });
    }

    return () => {
      if (viewerInstance.current) {
        viewerInstance.current.destroy();
        viewerInstance.current = null;
      }
    };
  }, []);

  // Update template when colors change
  useEffect(() => {
    if (viewerInstance.current) {
      const template = getTemplate(primaryColor, accentColor);
      viewerInstance.current.updateTemplate(template);
    }
  }, [primaryColor, accentColor]);

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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
      background: '#f5f5f5'
    }}>
      <div
        ref={viewerRef}
        style={{
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
}

export default Preview;
