import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { allProps, featureById } from './data.js';
import { state } from './state.js';
import { map } from './map.js';
import { filterDots } from './scatter.js';
import { clearSelection } from './selection.js';

/* ==========================================================================
   FILTERS (config-driven)
   mode 'max' keeps colleges with value <= slider; 'min' keeps value >= slider.
   To add a filter: add an entry to FILTERS and a matching slider block in the
   HTML. Nothing else needs to change.
   ========================================================================== */

const roundedExtent = (prop, step) => {
  const [lo, hi] = d3.extent(allProps, p => p[prop]);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
};

const FILTERS = [
  {
    prop: 'avg_net_price', mode: 'max',
    slider: 'price-slider', label: 'price-value',
    range: roundedExtent('avg_net_price', 1000), step: 500,
    format: d3.format('$,.0f')
  },
  {
    prop: 'earnings_10y_post_grad', mode: 'min',
    slider: 'earnings-slider', label: 'earnings-value',
    range: roundedExtent('earnings_10y_post_grad', 1000), step: 1000,
    format: d3.format('$,.0f')
  },
  {
    prop: 'acceptance_rate', mode: 'max',
    slider: 'accept-slider', label: 'accept-value',
    range: [0, 1], step: 0.01,   // values are 0–1 in the data
    format: d3.format('.0%')
  }
];

// "No filter" is the loosest position: max end for 'max', min end for 'min'
const isActive = f => f.value !== f.off;

// Does a college pass every active filter?
// Missing data is only excluded while that filter is actually narrowed.
function passes(p) {
  return FILTERS.every(f => {
    if (!isActive(f)) return true;
    const v = p[f.prop];
    if (v == null) return false;
    return f.mode === 'max' ? v <= f.value : v >= f.value;
  });
}

/** Push the current slider values to the labels, the chart and the map. */
export function applyFilters() {
  // Labels
  FILTERS.forEach(f => d3.select(`#${f.label}`).text(f.format(f.value)));

  // Scatterplot
  filterDots(passes);

  // Map
  if (state.mapReady) {
    const clauses = FILTERS.filter(isActive).map(f => [
      'all',
      ['has', f.prop],
      [f.mode === 'max' ? '<=' : '>=', ['get', f.prop], f.value]
    ]);
    map.setFilter('colleges', clauses.length ? ['all', ...clauses] : null);
  }

  // Deselect if the selected college was filtered out
  if (state.selectedId !== null && !passes(featureById.get(state.selectedId).properties)) {
    clearSelection();
  }
}

/** Configure each slider and start listening to it. */
export function setupFilters() {
  FILTERS.forEach(f => {
    f.el = document.getElementById(f.slider);
    f.off = f.mode === 'max' ? f.range[1] : f.range[0];
    f.value = f.off;
    Object.assign(f.el, { min: f.range[0], max: f.range[1], step: f.step, value: f.value });
    f.el.addEventListener('input', () => {
      f.value = +f.el.value;
      applyFilters();
    });
  });
}
