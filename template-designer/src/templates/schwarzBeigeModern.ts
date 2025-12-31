import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';

// Schwarz Beige Modern CV Template
// Exact replica of "Schwarz Beige Modern Bewerbung Karriere Marketing Manager Lebenslauf.pdf"
export const getSchwarzBeigeModernTemplate = (): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // ============ HEADER SECTION (Dark background) ============
      // Dark header background (charcoal gray)
      {
        name: 'headerBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 85,
        color: '#3d3d3d'
      },
      // Photo area (slightly darker)
      {
        name: 'photoBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 65,
        height: 85,
        color: '#2d2d2d'
      },
      // Profile Photo
      {
        name: 'profilePhoto',
        type: 'image',
        position: { x: 0, y: 0 },
        width: 65,
        height: 85
      },
      // First Name (LUKAS)
      {
        name: 'firstName',
        type: 'text',
        position: { x: 75, y: 15 },
        width: 125,
        height: 18,
        fontSize: 42,
        fontColor: '#ffffff',
        characterSpacing: 8,
        fontName: 'Helvetica-Bold'
      },
      // Last Name (BERGER)
      {
        name: 'lastName',
        type: 'text',
        position: { x: 75, y: 38 },
        width: 125,
        height: 18,
        fontSize: 42,
        fontColor: '#ffffff',
        characterSpacing: 8,
        fontName: 'Helvetica-Bold'
      },
      // Job Title (M A R K E T I N G   M A N A G E R)
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

      // ============ CONTACT BAR (White) ============
      {
        name: 'contactBar',
        type: 'rectangle',
        position: { x: 0, y: 85 },
        width: 210,
        height: 14,
        color: '#ffffff'
      },
      // Phone
      {
        name: 'phone',
        type: 'text',
        position: { x: 15, y: 89 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#333333'
      },
      // Email
      {
        name: 'email',
        type: 'text',
        position: { x: 75, y: 89 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: '#333333'
      },
      // Address
      {
        name: 'address',
        type: 'text',
        position: { x: 145, y: 89 },
        width: 60,
        height: 6,
        fontSize: 8,
        fontColor: '#333333'
      },

      // ============ LEFT SIDEBAR (Warm Beige/Cream) ============
      {
        name: 'sidebarBackground',
        type: 'rectangle',
        position: { x: 0, y: 99 },
        width: 65,
        height: 198,
        color: '#f5f0e8'
      },

      // --- BILDUNG Section ---
      {
        name: 'bildungTitle',
        type: 'text',
        position: { x: 8, y: 110 },
        width: 50,
        height: 8,
        fontSize: 11,
        fontColor: '#2d2d2d',
        characterSpacing: 2,
        fontName: 'Helvetica-Bold'
      },
      {
        name: 'bildungDegree',
        type: 'text',
        position: { x: 8, y: 125 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
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
        fontColor: '#2d2d2d',
        characterSpacing: 2,
        fontName: 'Helvetica-Bold'
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
        fontColor: '#2d2d2d',
        characterSpacing: 2,
        fontName: 'Helvetica-Bold'
      },
      {
        name: 'sprache1Name',
        type: 'text',
        position: { x: 8, y: 235 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
      },
      {
        name: 'sprache1Level',
        type: 'text',
        position: { x: 8, y: 242 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#a08060',
        fontName: 'Helvetica-Oblique'
      },
      {
        name: 'sprache2Name',
        type: 'text',
        position: { x: 8, y: 254 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
      },
      {
        name: 'sprache2Level',
        type: 'text',
        position: { x: 8, y: 261 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#a08060',
        fontName: 'Helvetica-Oblique'
      },
      {
        name: 'sprache3Name',
        type: 'text',
        position: { x: 8, y: 273 },
        width: 50,
        height: 6,
        fontSize: 9,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
      },
      {
        name: 'sprache3Level',
        type: 'text',
        position: { x: 8, y: 280 },
        width: 50,
        height: 6,
        fontSize: 8,
        fontColor: '#a08060',
        fontName: 'Helvetica-Oblique'
      },

      // ============ MAIN CONTENT (Right side - White) ============

      // --- BERUFSERFAHRUNG Title ---
      {
        name: 'experienceTitle',
        type: 'text',
        position: { x: 75, y: 110 },
        width: 125,
        height: 10,
        fontSize: 11,
        fontColor: '#2d2d2d',
        characterSpacing: 2,
        fontName: 'Helvetica-Bold'
      },

      // --- Job 1 ---
      {
        name: 'job1Date',
        type: 'text',
        position: { x: 75, y: 128 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666',
        characterSpacing: 1
      },
      {
        name: 'job1Title',
        type: 'text',
        position: { x: 75, y: 136 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
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
        fontColor: '#444444',
        lineHeight: 1.4
      },

      // --- Job 2 ---
      {
        name: 'job2Date',
        type: 'text',
        position: { x: 75, y: 182 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666',
        characterSpacing: 1
      },
      {
        name: 'job2Title',
        type: 'text',
        position: { x: 75, y: 190 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
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
        fontColor: '#444444',
        lineHeight: 1.4
      },

      // --- Job 3 ---
      {
        name: 'job3Date',
        type: 'text',
        position: { x: 75, y: 230 },
        width: 125,
        height: 6,
        fontSize: 9,
        fontColor: '#666666',
        characterSpacing: 1
      },
      {
        name: 'job3Title',
        type: 'text',
        position: { x: 75, y: 238 },
        width: 125,
        height: 7,
        fontSize: 10,
        fontColor: '#2d2d2d',
        fontName: 'Helvetica-Bold'
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
        fontColor: '#444444',
        lineHeight: 1.4
      }
    ]
  ]
});

// Default values matching the PDF
export const schwarzBeigeModernDefaults = {
  firstName: 'LUKAS',
  lastName: 'BERGER',
  jobTitle: 'M A R K E T I N G   M A N A G E R',
  phone: '(0221) 1234-56',
  email: 'hallo@superduperseite.de',
  address: 'Jede Straße 123, 12345 Jede Stadt',

  bildungTitle: 'B I L D U N G',
  bildungDegree: 'B. Sc. Marketing',
  bildungSchool: 'Universität Jede Stadt',
  bildungYears: '2012 - 2015',

  skillsTitle: 'S K I L L S',
  skill1: 'Teamleitung',
  skill2: 'Strategie',
  skill3: 'Kampagnen',
  skill4: 'Kommunikation',

  sprachenTitle: 'S P R A C H E N',
  sprache1Name: 'Deutsch',
  sprache1Level: 'Muttersprache',
  sprache2Name: 'Englisch',
  sprache2Level: 'Fließend',
  sprache3Name: 'Spanisch',
  sprache3Level: 'Grundkenntnisse',

  experienceTitle: 'B E R U F S E R F A H R U N G',

  job1Date: '0 5 / 2 0 2 0  -  H E U T E',
  job1Title: 'MARKETING MANAGER',
  job1Company: 'Momoka GmbH',
  job1Description: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat',

  job2Date: '0 2 / 2 0 1 8  -  0 4 / 2 0 2 0',
  job2Title: 'MARKETING SPECIALIST',
  job2Company: 'Borcelle GmbH',
  job2Description: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod',

  job3Date: '0 9 / 2 0 1 5  -  0 2 / 2 0 1 8',
  job3Title: 'MARKETING ASSISTANT',
  job3Company: 'Borcelle GmbH',
  job3Description: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut'
};
