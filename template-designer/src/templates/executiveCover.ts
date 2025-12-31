import type { Template } from '@pdfme/common';
import { BLANK_PDF } from '@pdfme/common';

// Executive Cover Template - Compass Style
// Based on premium CV cover design
export const getExecutiveCoverTemplate = (): Template => ({
  basePdf: BLANK_PDF,
  schemas: [
    [
      // ============ HEADER IMAGE AREA ============
      // Background for image area (placeholder gray)
      {
        name: 'imageBackground',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 210,
        height: 130,
        color: '#e8e8e8'
      },
      // Cover Image (Compass or custom image)
      {
        name: 'coverImage',
        type: 'image',
        position: { x: 0, y: 0 },
        width: 210,
        height: 130
      },
      // Small logo/icon area top left
      {
        name: 'logoArea',
        type: 'rectangle',
        position: { x: 15, y: 15 },
        width: 20,
        height: 20,
        color: '#ffffff',
        borderRadius: 3
      },

      // ============ NAME BAR ============
      // Dark blue name bar
      {
        name: 'nameBar',
        type: 'rectangle',
        position: { x: 0, y: 145 },
        width: 210,
        height: 22,
        color: '#1e3a5f'
      },
      // Full Name (large, white, centered)
      {
        name: 'fullName',
        type: 'text',
        position: { x: 10, y: 149 },
        width: 190,
        height: 16,
        fontSize: 32,
        fontColor: '#ffffff',
        alignment: 'center',
        fontName: 'Helvetica'
      },

      // ============ TITLE SECTION ============
      // Light gray background for content area
      {
        name: 'contentBackground',
        type: 'rectangle',
        position: { x: 0, y: 167 },
        width: 210,
        height: 130,
        color: '#f5f5f5'
      },
      // Academic Title / Degree
      {
        name: 'academicTitle',
        type: 'text',
        position: { x: 30, y: 185 },
        width: 150,
        height: 14,
        fontSize: 24,
        fontColor: '#1e3a5f',
        alignment: 'left',
        fontName: 'Helvetica'
      },
      // Job Title / Position
      {
        name: 'jobTitle',
        type: 'text',
        position: { x: 30, y: 210 },
        width: 150,
        height: 14,
        fontSize: 24,
        fontColor: '#1e3a5f',
        alignment: 'left',
        fontName: 'Helvetica-Bold'
      },

      // ============ CONTACT SECTION ============
      // Address Line 1 (Street)
      {
        name: 'addressStreet',
        type: 'text',
        position: { x: 30, y: 245 },
        width: 150,
        height: 8,
        fontSize: 12,
        fontColor: '#1e3a5f',
        alignment: 'left'
      },
      // Address Line 2 (City)
      {
        name: 'addressCity',
        type: 'text',
        position: { x: 30, y: 255 },
        width: 150,
        height: 8,
        fontSize: 12,
        fontColor: '#1e3a5f',
        alignment: 'left'
      },
      // Email
      {
        name: 'email',
        type: 'text',
        position: { x: 30, y: 272 },
        width: 150,
        height: 8,
        fontSize: 12,
        fontColor: '#1e3a5f',
        alignment: 'left'
      },
      // Phone
      {
        name: 'phone',
        type: 'text',
        position: { x: 30, y: 282 },
        width: 150,
        height: 8,
        fontSize: 12,
        fontColor: '#1e3a5f',
        alignment: 'left'
      }
    ]
  ]
});

// Default values for the template
export const executiveCoverDefaults = {
  fullName: 'Muammer Kizilaslan',
  academicTitle: 'Computer Scientist',
  jobTitle: 'Vice President IT & Digital',
  addressStreet: 'Am Sonnenhut 131',
  addressCity: '51109 Cologne (Germany)',
  email: 'Email: Muammer.Kizilaslan@gmail.com',
  phone: 'Mobile: +4915155880622'
};
