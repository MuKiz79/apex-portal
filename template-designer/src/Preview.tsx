import { useEffect, useState } from 'react';

// Original colors in the SVG that can be replaced
const ORIGINAL_COLORS = {
  primary: '#b76e22',   // Bronze - Job title, section headers, bottom shapes
  accent: '#8fa3b4',    // Blue-gray - Photo circle, contact icons
  circle: '#f4b4b7'     // Pink - Large decorative circle
};

function Preview() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get colors directly from URL params on every render
  const urlParams = new URLSearchParams(window.location.search);
  const primaryColor = urlParams.get('primary') || ORIGINAL_COLORS.primary;
  const accentColor = urlParams.get('accent') || ORIGINAL_COLORS.accent;
  const circleColor = urlParams.get('circle') || ORIGINAL_COLORS.circle;

  // Load SVG on mount
  useEffect(() => {
    const loadSvg = async () => {
      try {
        const response = await fetch('/template-designer/template-kreativ.svg');
        if (!response.ok) throw new Error('SVG nicht gefunden');
        const text = await response.text();
        setSvgContent(text);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading SVG:', err);
        setError('Fehler beim Laden der SVG-Vorlage');
        setIsLoading(false);
      }
    };
    loadSvg();
  }, []);

  // Replace colors in SVG
  const getColoredSvg = () => {
    if (!svgContent) return '';

    let colored = svgContent;

    // Escape special regex characters in color strings
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace primary color (case-insensitive)
    colored = colored.replace(new RegExp(escapeRegex(ORIGINAL_COLORS.primary), 'gi'), primaryColor);

    // Replace accent color (case-insensitive)
    colored = colored.replace(new RegExp(escapeRegex(ORIGINAL_COLORS.accent), 'gi'), accentColor);

    // Replace circle color (case-insensitive)
    colored = colored.replace(new RegExp(escapeRegex(ORIGINAL_COLORS.circle), 'gi'), circleColor);

    return colored;
  };

  // Create data URL for SVG
  const svgDataUrl = svgContent
    ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(getColoredSvg())))}`
    : null;

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      overflow: 'auto',
      background: '#e5e5e5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px',
      boxSizing: 'border-box'
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
      {svgDataUrl && (
        <div style={{
          background: 'white',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <img
            src={svgDataUrl}
            alt="CV Vorschau"
            style={{
              width: '595px',
              height: 'auto',
              display: 'block'
            }}
          />
        </div>
      )}
      {/* Color indicator */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        display: 'flex',
        gap: '12px',
        background: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        fontSize: '12px',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            background: primaryColor,
            borderRadius: '4px',
            border: '1px solid rgba(0,0,0,0.1)'
          }}></div>
          <span>Primary</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            background: accentColor,
            borderRadius: '4px',
            border: '1px solid rgba(0,0,0,0.1)'
          }}></div>
          <span>Accent</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            background: circleColor,
            borderRadius: '4px',
            border: '1px solid rgba(0,0,0,0.1)'
          }}></div>
          <span>Circle</span>
        </div>
      </div>
    </div>
  );
}

export default Preview;
