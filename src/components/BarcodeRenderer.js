'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Standards-compliant Code 128 / EAN / UPC Barcode Vector Renderer.
 * Supports alphanumeric strings (receipt numbers, batch IDs, fabric roll tags).
 */
export default function BarcodeRenderer({
  value,
  format = 'CODE128',
  width = 1.5,
  height = 42,
  displayValue = true,
  fontSize = 11,
  className = '',
  lineColor = '#000000',
  background = 'transparent',
}) {
  const svgRef = useRef(null);
  const fallbackRef = useRef(null);

  useEffect(() => {
    const rawVal = typeof value === 'string' ? value.trim() : '';

    if (!svgRef.current || !rawVal) {
      if (svgRef.current) svgRef.current.style.display = 'none';
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex';
      return;
    }

    try {
      JsBarcode(svgRef.current, rawVal, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        textMargin: 3,
        font: 'monospace',
        fontOptions: 'bold',
        lineColor,
        background,
        margin: 4,
        valid: (valid) => {
          if (valid) {
            if (svgRef.current) svgRef.current.style.display = 'block';
            if (fallbackRef.current) fallbackRef.current.style.display = 'none';
          } else {
            if (svgRef.current) svgRef.current.style.display = 'none';
            if (fallbackRef.current) fallbackRef.current.style.display = 'flex';
          }
        },
      });
    } catch (err) {
      console.warn('Barcode rendering warning for value:', rawVal, err);
      if (svgRef.current) svgRef.current.style.display = 'none';
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex';
    }
  }, [value, format, width, height, displayValue, fontSize, lineColor, background]);

  const hasValue = Boolean(value && typeof value === 'string' && value.trim() !== '');

  return (
    <div className={`flex flex-col justify-center items-center overflow-hidden ${className}`}>
      <svg ref={svgRef} className="max-w-full h-auto select-none" />
      <div
        ref={fallbackRef}
        style={{ display: hasValue ? 'none' : 'flex' }}
        className="flex-col items-center justify-center p-2 rounded border border-dashed border-slate-300 text-slate-400 text-xs font-mono"
      >
        <span>[Barcode Not Available]</span>
        {hasValue ? <span className="text-[10px] text-slate-500 mt-0.5">{value}</span> : null}
      </div>
    </div>
  );
}
