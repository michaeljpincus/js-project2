import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ==========================================================================
   HELPERS: small pure functions for formatting and HTML.
   ========================================================================== */

// Formatters that tolerate missing data
export const fmtInt = v => (v == null ? '—' : d3.format(',')(v));
export const fmtUSD = v => (v == null ? '—' : d3.format('$,.0f')(v));
export const fmtPct = v => (v == null ? '—' : d3.format('.0%')(v));   // assumes 0–1 values
export const fmtK = v => `$${v / 1000}K`;

export const bold = v => `<strong>${v}</strong>`;

// Escape text from the data so a name containing & or < can't break the HTML
export const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export function popupHTML({ name, ownership_label }) {
  return `
    <span class="college-name">${esc(name)}</span><br>
    <span class="ownership-label">${esc(ownership_label)}</span>`;
}
