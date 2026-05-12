import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Hook: create a Chart.js chart on the passed canvas ref, destroy on unmount/deps change.
// Call pattern:
//   const canvasRef = useRef(null);
//   useChart(canvasRef, () => ({ type: 'bar', data: ..., options: ..., plugins: [...] }), [data]);
export function useChart(canvasRef, configBuilder, deps) {
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Clean up any previous chart attached to this canvas
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const config = configBuilder();
    if (!config) return undefined;

    chartRef.current = new Chart(canvas.getContext('2d'), config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return chartRef;
}
