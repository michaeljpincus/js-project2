import * as maplibregl from 'https://unpkg.com/maplibre-gl@^6.12.0/dist/maplibre-gl.mjs';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';


/* ==========================================================================
   1. CONFIG
   ========================================================================== */

const INITIAL_CENTER = [-75.93286341656814, 42.6617285841208];
const INITIAL_ZOOM = 6.5;

// One color list shared by the scatterplot and the map.
// Index 0 is the fallback, then ownership 1, 2, 3.
const OWNERSHIP_COLORS = ['gray', '#009E73', '#0072B2', '#E69F00'];
const SELECTED_COLOR = 'crimson';

const DOT_RADIUS = 4;
const DOT_RADIUS_SELECTED = 8;

const MARGIN = { top: 40, right: 20, bottom: 50, left: 70 };
const MIN_PLOT_HEIGHT = 80;

const STUDENT_MAX = 100000;
const radiusScale = d3.scaleLinear()
  .domain([0, STUDENT_MAX])
  .range([5, 100]);   // pixel radius on the map

// Shared color scale: ownership code -> color
const color = d3.scaleThreshold()
  .domain([1, 2, 3])
  .range(OWNERSHIP_COLORS);


/* ==========================================================================
   2. DOM REFERENCES
   ========================================================================== */

const resetButton = document.getElementById('reset-zoom');
const scatterBox = document.getElementById('scatter');
const info = d3.select('#info');
const legend = d3.select('#legend');
const collegeSelect = d3.select('#college-select');


/* ==========================================================================
   3. DATA
   Load this BEFORE creating the map.
   ========================================================================== */

const geojson = await d3.json('colleges.geojson');

// Give every college a stable id. The chart and the map share this key.
geojson.features.forEach((f, i) => {
  f.properties.id = f.properties.id ?? i;
});

const allProps = geojson.features.map(f => f.properties);
const featureById = new Map(geojson.features.map(f => [f.properties.id, f]));

// Colleges missing either value can't be plotted (they still appear on the map).
const plotData = allProps.filter(
  d => d.avg_net_price != null && d.earnings_10y_post_grad != null
);
const plotById = new Map(plotData.map(d => [d.id, d]));


/* ==========================================================================
   4. SHARED STATE
   ========================================================================== */

let selectedId = null;
let mapReady = false;   // true once the map style and layers exist


/* ==========================================================================
   5. HELPERS
   ========================================================================== */

// Formatters that tolerate missing data
const fmtInt = v => (v == null ? '—' : d3.format(',')(v));
const fmtUSD = v => (v == null ? '—' : d3.format('$,.0f')(v));
const fmtPct = v => (v == null ? '—' : d3.format('.0%')(v));  
const fmtK = v => `$${v / 1000}K`;

const bold = v => `<strong>${v}</strong>`;

// Escape text from the data so a name containing & or < can't break the HTML
const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function popupHTML({ name, ownership_label }) {
  return `
    <span class="college-name">${esc(name)}</span><br>
    <span class="ownership-label">${esc(ownership_label)}</span>`;
}


/* ==========================================================================
   6. MAP SETUP (creation only; layers and events are in section 14)
   ========================================================================== */

const map = new maplibregl.Map({
  container: 'map',
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  minZoom: 6.5,
  style: 'basemap.json'   // custom basemap
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// Hover popup (follows the cursor) and selected popup (stays on the clicked college)
const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
const selectedPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });


/* ==========================================================================
   7. SCATTERPLOT: structure
   Sizes and positions are set in updateChart() (section 8).
   ========================================================================== */

let WIDTH = 500 - MARGIN.left - MARGIN.right;
let HEIGHT = 420 - MARGIN.top - MARGIN.bottom;

// Root SVG is sized in pixels by updateChart(); no viewBox, so nothing is scaled.
const svgRoot = d3.select('#scatter').append('svg');

const svg = svgRoot.append('g')
  .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

// Scales (ranges are set in updateChart)
const x = d3.scaleLinear().domain(d3.extent(plotData, d => d.avg_net_price));
const y = d3.scaleLinear().domain(d3.extent(plotData, d => d.earnings_10y_post_grad));

// Axes
const xAxisG = svg.append('g').attr('class', 'axis x-axis');
const yAxisG = svg.append('g').attr('class', 'axis y-axis');

// Titles
svg.append('text')
  .attr('class', 'chart-title')
  .attr('x', -MARGIN.left + 10)
  .attr('y', -MARGIN.top + 22)
  .text('Cost vs. earnings');

const xLabel = svg.append('text')
  .attr('class', 'axis-label')
  .attr('text-anchor', 'middle')
  .text('Average net cost of attendance');

const yLabel = svg.append('text')
  .attr('class', 'axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('y', -MARGIN.left + 16)
  .attr('text-anchor', 'middle')
  .text('Median earnings 10 years after graduation');

// Dots
const dots = svg.selectAll('.dot')
  .data(plotData, d => d.id)
  .join('circle')
  .attr('class', 'dot')
  .attr('r', DOT_RADIUS)
  .attr('fill', d => color(d.ownership))
  .attr('opacity', 0.6)
  .style('cursor', 'pointer');

// Hover ring (drawn when hovering a college on the map)
const hoverRing = svg.append('circle')
  .attr('class', 'hover-ring')
  .attr('r', 11)                     // bigger than the selected dot (8)
  .attr('fill', 'none')
  .attr('stroke', 'black')
  .attr('stroke-width', 1.5)
  .style('pointer-events', 'none')   // never blocks dot hovers or clicks
  .style('display', 'none');

function showHoverRing(id) {
  const d = plotById.get(id);
  if (!d) return hideHoverRing();    // this college has no dot
  hoverRing
    .attr('cx', x(d.avg_net_price))
    .attr('cy', y(d.earnings_10y_post_grad))
    .style('display', null);
}

function hideHoverRing() {
  hoverRing.style('display', 'none');
}

// Tooltip
const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'scatter-tooltip')
  .style('position', 'absolute')
  .style('pointer-events', 'none')   // never blocks the mouse
  .style('opacity', 0);

// Place the tooltip to the left of a page position.
function placeTooltip(pageX, pageY) {
  const w = tooltip.node().offsetWidth;
  tooltip
    .style('left', `${pageX - w - 12}px`)
    .style('top', `${pageY - 28}px`);
}


/* ==========================================================================
   8. SCATTERPLOT: responsive layout
   Fits the plot to whatever space the container has. Only the plot's
   dimensions change; text and circles stay at normal size.
   ========================================================================== */

function updateChart() {
  const cs = getComputedStyle(scatterBox);
  const availW = scatterBox.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = scatterBox.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);

  WIDTH  = Math.max(100, availW - MARGIN.left - MARGIN.right);
  HEIGHT = Math.max(MIN_PLOT_HEIGHT, availH - MARGIN.top - MARGIN.bottom);

  svgRoot
    .attr('width',  WIDTH  + MARGIN.left + MARGIN.right)
    .attr('height', HEIGHT + MARGIN.top  + MARGIN.bottom);

  x.range([0, WIDTH]);
  y.range([HEIGHT, 0]);

  xAxisG
    .attr('transform', `translate(0,${HEIGHT})`)
    .call(d3.axisBottom(x).ticks(Math.max(3, WIDTH / 70)).tickFormat(fmtK));

  yAxisG
    .call(d3.axisLeft(y).ticks(Math.max(2, HEIGHT / 40)).tickFormat(fmtK));

  xLabel.attr('x', WIDTH / 2).attr('y', HEIGHT + 40);
  yLabel.attr('x', -HEIGHT / 2);

  dots
    .attr('cx', d => x(d.avg_net_price))
    .attr('cy', d => y(d.earnings_10y_post_grad));

  hideHoverRing();   // its old position is stale after a resize
}


/* ==========================================================================
   9. INFO PANEL
   ========================================================================== */

function showInfoPlaceholder() {
  info.html('');
  info.append('div')
    .attr('class', 'info-placeholder')
    .text('Click a college on the map or chart to see details.');
}

function infoParagraph(p) {
  const parts = [];

  if (p.student_pop != null)
    parts.push(`${esc(p.name)} enrolls about ${bold(fmtInt(p.student_pop))} students.`);

  if (p.acceptance_rate != null)
    parts.push(`It admits ${bold(fmtPct(p.acceptance_rate))} of applicants, and ${
      p.graduation_rate != null
        ? `${bold(fmtPct(p.graduation_rate))} of students go on to graduate.`
        : 'graduation data is unavailable.'}`);
  else if (p.graduation_rate != null)
    parts.push(`${bold(fmtPct(p.graduation_rate))} of students go on to graduate.`);

  if (p.avg_net_price != null)
    parts.push(`The average net price is ${bold(fmtUSD(p.avg_net_price))} per year.`);

  if (p.earnings_10y_post_grad != null)
    parts.push(`Ten years after graduation, earnings average around ${bold(fmtUSD(p.earnings_10y_post_grad))}.`);

  return parts.length ? parts.join(' ') : 'No additional data is available for this college.';
}

function showInfo(p) {
  info.html('');

  if (p.image_url) {
    info.append('img')
      .attr('class', 'info-photo')
      .attr('src', p.image_url)
      .attr('alt', `Photo of ${p.name}`)
      .on('error', function () { this.remove(); });   // drop it if the URL is broken
  }

  info.append('h2').attr('class', 'info-name').text(p.name);
  info.append('div').attr('class', 'info-type').text(p.ownership_label);
  info.append('p').attr('class', 'info-text').html(infoParagraph(p));
}


/* ==========================================================================
   10. LEGEND
   ========================================================================== */

function buildLegend() {
  // Color: one row per ownership type found in the data
  legend.append('div').attr('class', 'legend-title').text('Ownership');

  const owners = Array.from(
    d3.group(allProps.filter(p => p.ownership != null), p => p.ownership),
    ([ownership, group]) => ({ ownership, label: group[0].ownership_label })
  ).sort((a, b) => a.ownership - b.ownership);

  const legendRows = legend.selectAll('.legend-row')
    .data(owners)
    .join('div')
    .attr('class', 'legend-row');

  legendRows.append('span')
    .attr('class', 'legend-swatch')
    .style('background', d => color(d.ownership));
  legendRows.append('span').text(d => d.label);

  // Size: sample circles at example enrollments
  legend.append('div').attr('class', 'legend-title').text('Enrollment');

  const sizes = legend.append('div')
    .attr('class', 'legend-sizes')
    .selectAll('.legend-size')
    .data([5000, 25000, 50000])        // adjust to suit your data
    .join('div')
    .attr('class', 'legend-size');

  sizes.append('div')
    .attr('class', 'legend-circle')
    .style('width', d => `${2 * radiusScale(d)}px`)
    .style('height', d => `${2 * radiusScale(d)}px`);
  sizes.append('div').text(d => d3.format(',')(d));
}


/* ==========================================================================
   11. DROPDOWN
   ========================================================================== */

function buildDropdown() {
  const sorted = [...allProps].sort((a, b) => d3.ascending(a.name, b.name));

  collegeSelect.append('option')
    .attr('value', '')
    .text('Select a college…');

  collegeSelect.selectAll('.college-option')
    .data(sorted, d => d.id)
    .join('option')
    .attr('class', 'college-option')
    .attr('value', d => d.id)
    .text(d => d.name);

  collegeSelect.on('change', function () {
    const option = this.selectedOptions[0];
    if (!option.value) return clearSelection();
    selectCollege(d3.select(option).datum().id, { fly: true });
  });
}


/* ==========================================================================
   12. SELECTION LOGIC (the bridge between chart and map)
   Both views call selectCollege(id); it updates everything.
   ========================================================================== */

function highlightDot(id) {
  dots
    .attr('fill', d => (d.id === id ? SELECTED_COLOR : color(d.ownership)))
    .attr('r', d => (d.id === id ? DOT_RADIUS_SELECTED : DOT_RADIUS));
}

function flyToId(id) {
  map.flyTo({ center: featureById.get(id).geometry.coordinates, zoom: 10 });
}

function selectCollege(id, { fly = false } = {}) {
  const feature = featureById.get(id);
  if (!feature) return;

  selectedId = id;
  collegeSelect.property('value', id);
  showInfo(feature.properties);
  hoverPopup.remove();   // avoid two identical popups
  highlightDot(id);

  selectedPopup
    .setLngLat(feature.geometry.coordinates)
    .setHTML(popupHTML(feature.properties))
    .addTo(map);

  if (fly) flyToId(id);
}

function clearSelection() {
  selectedId = null;
  selectedPopup.remove();
  collegeSelect.property('value', '');
  showInfoPlaceholder();
  highlightDot(null);
}


/* ==========================================================================
   13. FILTERS (config-driven)
   mode 'max' keeps colleges with value <= slider; 'min' keeps value >= slider.
   To add a filter: add an entry here and a matching slider block in the HTML.
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

function applyFilters() {
  // Labels
  FILTERS.forEach(f => d3.select(`#${f.label}`).text(f.format(f.value)));

  // Scatterplot
  dots.attr('display', d => (passes(d) ? null : 'none'));
  hideHoverRing();

  // Map
  if (mapReady) {
    const clauses = FILTERS.filter(isActive).map(f => [
      'all',
      ['has', f.prop],
      [f.mode === 'max' ? '<=' : '>=', ['get', f.prop], f.value]
    ]);
    map.setFilter('colleges', clauses.length ? ['all', ...clauses] : null);
  }

  // Deselect if the selected college was filtered out
  if (selectedId !== null && !passes(featureById.get(selectedId).properties)) {
    clearSelection();
  }
}

function setupFilters() {
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


/* ==========================================================================
   14. EVENTS
   ========================================================================== */

function setupScatterEvents() {
  dots
    .on('click', (event, d) => {
      selectCollege(d.id, { fly: true });
    })
    .on('mouseover', function (event, d) {
      d3.select(this).attr('stroke', 'black').attr('stroke-width', 1.5);
      tooltip.style('opacity', 1).text(d.name);
    })
    .on('mousemove', (event) => {
      placeTooltip(event.pageX, event.pageY);
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke', null);
      tooltip.style('opacity', 0);
    });
}

function setupMapLayers() {
  map.addSource('colleges', {
    type: 'geojson',
    data: geojson,        // same object as the chart, so ids match
    generateId: true
  });

  map.addLayer({
    id: 'colleges',
    type: 'circle',
    source: 'colleges',
    paint: {
      'circle-color': [
        'step', ['get', 'ownership'],
        OWNERSHIP_COLORS[0],
        1, OWNERSHIP_COLORS[1],
        2, OWNERSHIP_COLORS[2],
        3, OWNERSHIP_COLORS[3]
      ],
      'circle-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1,
        0.6
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'student_pop'],
        0, radiusScale(0),
        STUDENT_MAX, radiusScale(STUDENT_MAX)
      ]
    }
  }, 'cities');   // draw beneath the 'cities' layer
}

function setupMapEvents() {
  let hoveredFeatureId = null;   // MapLibre's generated id, used for feature-state

  function clearHoverState() {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: false });
      hoveredFeatureId = null;
    }
  }

  // Hover
  map.on('mousemove', 'colleges', (e) => {
    const feature = e.features[0];
    showHoverRing(feature.properties.id);

    if (hoveredFeatureId !== feature.id) clearHoverState();
    hoveredFeatureId = feature.id;
    map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: true });

    map.getCanvas().style.cursor = 'pointer';

    // The selected college already has its own popup.
    if (feature.properties.id === selectedId) {
      hoverPopup.remove();
      return;
    }

    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(popupHTML(feature.properties))
      .addTo(map);
  });

  map.on('mouseleave', 'colleges', () => {
    clearHoverState();
    hideHoverRing();
    hoverPopup.remove();
    map.getCanvas().style.cursor = '';
  });

  // Click: selects a college, or clears if clicking empty map
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['colleges'] });
    if (hits.length) selectCollege(hits[0].properties.id, { fly: true });
    else clearSelection();
  });

  // Reset-zoom button
  map.on('zoom', () => {
    resetButton.style.display = map.getZoom() > INITIAL_ZOOM ? 'block' : 'none';
  });

  resetButton.addEventListener('click', () => {
    clearSelection();
    map.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM, duration: 1000 });
  });
}


/* ==========================================================================
   15. INIT
   ========================================================================== */

buildLegend();
buildDropdown();
showInfoPlaceholder();

setupFilters();
setupScatterEvents();

new ResizeObserver(updateChart).observe(scatterBox);
updateChart();

applyFilters();   // initialize slider labels

map.on('load', () => {
  setupMapLayers();
  setupMapEvents();
  mapReady = true;
  applyFilters();   // in case a slider moved before the map finished loading
});