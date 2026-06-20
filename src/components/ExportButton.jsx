import { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Chart } from 'chart.js';

// We need the current filtered data at export time. The easiest way is to reach into
// the dashboard's filter state via the DOM: the date pickers already hold the range,
// and we re-derive filtered data from the canonical source if needed. But since this
// component is rendered inside DashboardPage's filter bar, the simplest approach is
// to read data directly from the in-flight ERTMS store on window. Instead of creating
// a window global, we capture the data by re-running the same parseWorkbook+filter logic.
// However, the cleaner approach is to accept the filtered data as a prop. For now, we
// only need the date range for the filename and for informational purposes — the SVG
// map fallback reads the actual rendered data from the live Leaflet container.

export default function ExportButton({ dateFrom, dateTo, filteredData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(null); // null | 'png' | 'pdf' — controls the "preparing" overlay
  const [capturing, setCapturing] = useState(false); // hides the overlay during the actual html2canvas call
  const wrapRef = useRef(null);

  // Close the menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  const runExport = async (format) => {
    setMenuOpen(false);
    setBusy(format);

    const dashboard = document.getElementById('page-dashboard');
    if (!dashboard) {
      setBusy(null);
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `ONCF_tableau_de_bord_${dateFrom || ''}_${dateTo || ''}_${stamp}`.replace(
      /[^\w-]/g,
      '_'
    );

    const TARGET_WIDTH = 1600;
    const mainEl = dashboard.closest('.main') || dashboard.parentElement;
    const bodyEl = document.body;

    // Snapshot the styles we're about to mutate so we can restore them afterward
    const prev = {
      dashWidth: dashboard.style.width,
      dashMaxWidth: dashboard.style.maxWidth,
      dashMinWidth: dashboard.style.minWidth,
      dashPadding: dashboard.style.padding,
      dashPosition: dashboard.style.position,
      dashLeft: dashboard.style.left,
      dashTop: dashboard.style.top,
      mainWidth: mainEl ? mainEl.style.width : '',
      mainMinWidth: mainEl ? mainEl.style.minWidth : '',
      bodyMinWidth: bodyEl.style.minWidth,
      bodyOverflow: bodyEl.style.overflow,
    };

    // Force a wide desktop layout so charts stretch full-width for a crisp capture.
    // We also pull the dashboard out of normal flow and pin it to (0, 0) during capture,
    // so html2canvas doesn't include the 260px sidebar gap on the left in its output.
    dashboard.style.width = TARGET_WIDTH + 'px';
    dashboard.style.maxWidth = TARGET_WIDTH + 'px';
    dashboard.style.minWidth = TARGET_WIDTH + 'px';
    dashboard.style.position = 'absolute';
    dashboard.style.left = '0';
    dashboard.style.top = '0';
    if (mainEl) {
      mainEl.style.width = TARGET_WIDTH + 'px';
      mainEl.style.minWidth = TARGET_WIDTH + 'px';
    }
    bodyEl.style.minWidth = TARGET_WIDTH + 'px';
    bodyEl.style.overflow = 'hidden';

    // Hide the export button itself from the capture
    const exportWrap = wrapRef.current;
    const prevExportDisplay = exportWrap ? exportWrap.style.display : '';
    if (exportWrap) exportWrap.style.display = 'none';

    // Bump chart DPR so the backing bitmaps are rendered at 3x.
    // Without this, html2canvas' scale:3 stretches the 1x bitmaps → blurry charts.
    const CAPTURE_DPR = 3;
    const allCharts = Object.values(Chart.instances || {});
    const prevChartDPR = [];
    allCharts.forEach((c) => {
      try {
        prevChartDPR.push({ chart: c, dpr: c.options.devicePixelRatio });
        c.options.devicePixelRatio = CAPTURE_DPR;
        c.resize();
        c.update('none');
      } catch (e) {
        /* one chart failing shouldn't abort the whole export */
      }
    });

    // Let the browser reflow + charts finish their DPR bump, and tiles finish loading
    await new Promise((r) => setTimeout(r, 400));

    const restore = () => {
      dashboard.style.width = prev.dashWidth;
      dashboard.style.maxWidth = prev.dashMaxWidth;
      dashboard.style.minWidth = prev.dashMinWidth;
      dashboard.style.padding = prev.dashPadding;
      dashboard.style.position = prev.dashPosition;
      dashboard.style.left = prev.dashLeft;
      dashboard.style.top = prev.dashTop;
      if (mainEl) {
        mainEl.style.width = prev.mainWidth;
        mainEl.style.minWidth = prev.mainMinWidth;
      }
      bodyEl.style.minWidth = prev.bodyMinWidth;
      bodyEl.style.overflow = prev.bodyOverflow;
      if (exportWrap) exportWrap.style.display = prevExportDisplay;

      // Restore each chart's DPR and redraw at normal density
      prevChartDPR.forEach(({ chart, dpr }) => {
        try {
          chart.options.devicePixelRatio = dpr;
          chart.resize();
          chart.update('none');
        } catch (e) {
          /* ignore */
        }
      });

    };

    try {
      const captureScale = 3;

      // Hide the overlay right before the actual capture, then show it again after.
      // html2canvas renders whatever is on screen — if the overlay is visible, it ends
      // up in the output image as a grey wash with the spinner card in the middle.
      setCapturing(true);
      // Give React one paint tick to actually hide the overlay before we capture
      await new Promise((r) => setTimeout(r, 50));

      const canvas = await html2canvas(dashboard, {
        scale: captureScale,
        backgroundColor: '#F6F7FB', // matches --paper
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: TARGET_WIDTH,
        windowWidth: TARGET_WIDTH,
        windowHeight: dashboard.scrollHeight,
        imageTimeout: 20000,
        foreignObjectRendering: false,
      });

      // Show the overlay again while we encode PNG / build the PDF
      setCapturing(false);

      restore();

      if (format === 'png') {
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = baseName + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setBusy(null);
        }, 'image/png');
      } else {
        // PDF: fit onto A4 landscape. PNG encoding (lossless) + NONE compression
        // keeps chart edges and small text crisp at the cost of a bigger file (~2-4 MB).
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
          compress: false,
        });
        const pageW = pdf.internal.pageSize.getWidth(); // 297mm
        const pageH = pdf.internal.pageSize.getHeight(); // 210mm
        const margin = 6;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2 - 4; // leave room for footer

        const imgRatio = canvas.width / canvas.height;
        let drawW = maxW;
        let drawH = maxW / imgRatio;
        if (drawH > maxH) {
          drawH = maxH;
          drawW = maxH * imgRatio;
        }
        const offsetX = (pageW - drawW) / 2;
        const offsetY = margin;

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH, undefined, 'NONE');

        pdf.setFontSize(7);
        pdf.setTextColor(140);
        const footer = `ONCF — Service Optimisation · Généré le ${new Date().toLocaleString(
          'fr-FR'
        )} · Période : ${dateFrom || '—'} → ${dateTo || '—'}`;
        pdf.text(footer, pageW / 2, pageH - 3, { align: 'center' });

        pdf.save(baseName + '.pdf');
        setBusy(null);
      }
    } catch (e) {
      setCapturing(false);
      restore();
      setBusy(null);
      alert('Erreur lors de l\'export : ' + (e.message || e));
      console.error('Export error:', e);
    }
  };

  return (
    <>
      <div ref={wrapRef} className="export-wrap">
        <button
          className={`export-btn ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          title="Exporter le tableau de bord"
          disabled={!!busy}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exporter
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className={`export-menu ${menuOpen ? 'open' : ''}`}>
          <button onClick={() => runExport('png')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>
              <strong>Image PNG</strong>
              <em>Capture haute résolution</em>
            </span>
          </button>
          <button onClick={() => runExport('pdf')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>
              <strong>Document PDF</strong>
              <em>Format A4 paysage</em>
            </span>
          </button>
        </div>
      </div>

      {busy && !capturing && (
        <div className="export-overlay active">
          <div className="export-card">
            <div className="export-spinner"></div>
            <span>
              {busy === 'pdf' ? 'Génération du PDF...' : "Génération de l'image..."}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// Fallback: if we don't have filteredData as a prop, try to reload from the source.
// This is only used during export when the SVG map needs coordinate data.
async function loadFallbackData() {
  try {
    const folderLoad = await tryLoadFromFolder();
    return folderLoad?.data || [];
  } catch (e) {
    return [];
  }
}