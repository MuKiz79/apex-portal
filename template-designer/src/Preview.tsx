import { useEffect, useState } from 'react';

// Template configurations with their original colors
// Only include colors that should be replaceable by the customer
const TEMPLATE_CONFIGS: Record<string, {
  file: string;
  colors: { primary: string; accent?: string; circle?: string };
}> = {
  kreativ: {
    file: '/template-designer/template-kreativ.svg',
    colors: {
      primary: '#b76e22',   // Bronze - Job title, section headers, bottom shapes
      accent: '#8fa3b4',    // Blue-gray - Photo circle, contact icons
      circle: '#f4b4b7'     // Pink - Large decorative circle
    }
  },
  compact: {
    file: '/template-designer/template-compact.svg',
    colors: {
      primary: '#374f59'    // Dark teal - Header bar (only this color is replaceable)
      // Text color #242e32 stays fixed - NOT included here
    }
  }
};

// Default template
const DEFAULT_TEMPLATE = 'kreativ';

function Preview() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100); // Zoom in percent

  // Get template and colors from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const templateId = urlParams.get('template') || DEFAULT_TEMPLATE;
  const templateConfig = TEMPLATE_CONFIGS[templateId] || TEMPLATE_CONFIGS[DEFAULT_TEMPLATE];
  const isFullscreen = urlParams.get('fullscreen') === 'true'; // Show zoom controls only in fullscreen mode

  // Get colors from URL params - only if the template supports that color
  const primaryColor = urlParams.get('primary') || templateConfig.colors.primary;
  const accentColor = templateConfig.colors.accent ? (urlParams.get('accent') || templateConfig.colors.accent) : null;
  const circleColor = templateConfig.colors.circle ? (urlParams.get('circle') || templateConfig.colors.circle) : null;

  // Load SVG on mount or when template changes
  useEffect(() => {
    const loadSvg = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(templateConfig.file + '?t=' + Date.now());
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
  }, [templateConfig.file]);

  // Replace colors in SVG - only replace colors that are defined for this template
  const getColoredSvg = () => {
    if (!svgContent) return '';

    let colored = svgContent;

    // Escape special regex characters in color strings
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace primary color (always present)
    colored = colored.replace(new RegExp(escapeRegex(templateConfig.colors.primary), 'gi'), primaryColor);

    // Replace accent color only if template supports it
    if (templateConfig.colors.accent && accentColor) {
      colored = colored.replace(new RegExp(escapeRegex(templateConfig.colors.accent), 'gi'), accentColor);
    }

    // Replace circle color only if template supports it
    if (templateConfig.colors.circle && circleColor) {
      colored = colored.replace(new RegExp(escapeRegex(templateConfig.colors.circle), 'gi'), circleColor);
    }

    return colored;
  };

  // Create data URL for SVG
  const svgDataUrl = svgContent
    ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(getColoredSvg())))}`
    : null;

  const zoomIn = () => setZoom(z => Math.min(z + 25, 200));
  const zoomOut = () => setZoom(z => Math.max(z - 25, 25));
  const resetZoom = () => setZoom(100);

  // Simple embedded view (for template cards and small previews)
  if (!isFullscreen) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0',
        margin: '0'
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '14px'
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
          <img
            src={svgDataUrl}
            alt="CV Vorschau"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block'
            }}
          />
        )}
      </div>
    );
  }

  // Fullscreen view with zoom controls
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      overflow: 'auto',
      background: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0',
      margin: '0',
      boxSizing: 'border-box'
    }}>
      {/* Zoom Controls */}
      <div style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        background: 'white',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid #e0e0e0',
        zIndex: 100,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <button
          onClick={zoomOut}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            background: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Verkleinern"
        >
          −
        </button>
        <button
          onClick={resetZoom}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            background: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            minWidth: '80px'
          }}
          title="Zurücksetzen"
        >
          {zoom}%
        </button>
        <button
          onClick={zoomIn}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            background: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Vergrößern"
        >
          +
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
        width: '100%'
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '14px'
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
          <img
            src={svgDataUrl}
            alt="CV Vorschau"
            style={{
              width: `${zoom}%`,
              maxWidth: `${zoom * 6}px`,
              height: 'auto',
              display: 'block',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              background: 'white'
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Preview;
