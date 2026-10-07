import * as maplibregl from 'https://unpkg.com/maplibre-gl@^6.12.0/dist/maplibre-gl.mjs';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ==========================================================================
   1. CONSTANTS
   ========================================================================== */

// One color list shared by the scatterplot and the map.
// Index 0 is the fallback, then ownership 1, 2, 3.
const OWNERSHIP_COLORS = ['gray', '#009E73', '#0072B2', '#E69F00'];
const SELECTED_COLOR = 'crimson';

const DOT_RADIUS = 4;
const DOT_RADIUS_SELECTED = 8;

const MARGIN = { top: 40, right: 20, bottom: 50, left: 70 };
const WIDTH = 500 - MARGIN.left - MARGIN.right;
const HEIGHT = 420 - MARGIN.top - MARGIN.bottom;   // was 400

const STUDENT_MAX = 100000;
const radiusScale = d3.scaleLinear()
  .domain([0, STUDENT_MAX])
  .range([5, 100]);   // pixel radius on the map


/* ==========================================================================
   2. DATA
   Load this BEFORE creating the map, so the map's 'load' event can't fire
   while we're still waiting on the file.
   ========================================================================== */

const geojson = await d3.json('colleges.geojson');

// Give every college a stable id. The chart and the map share this key.
geojson.features.forEach((f, i) => {
  f.properties.id = f.properties.id ?? i;
});

const featureById = new Map(geojson.features.map(f => [f.properties.id, f]));

// Colleges missing either value can't be plotted (they still appear on the map).
const plotData = geojson.features
  .map(f => f.properties)
  .filter(d => d.avg_net_price != null && d.earnings_10y_post_grad != null);


/* ==========================================================================
   3. SHARED STATE
   ========================================================================== */

let selectedId = null;


/* ==========================================================================
   4. MAP SETUP
   ========================================================================== */

const map = new maplibregl.Map({
  container: 'map',
  center: [-75.63286341656814, 42.7617285841208],
  zoom: 6.4,
  minZoom: 3,
  style: 'basemap.json' // custom basemap
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// Hover popup (follows the cursor) and selected popup (stays on the clicked college)
const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
const selectedPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });


/* ==========================================================================
   5. SCATTERPLOT
   ========================================================================== */

const svg = d3.select('#scatter')
  .append('svg')
  .attr('viewBox', `0 0 ${WIDTH + MARGIN.left + MARGIN.right} ${HEIGHT + MARGIN.top + MARGIN.bottom}`)
  .style('width', '100%')
  .style('height', 'auto')
  .append('g')
  .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

// Scales: data units -> pixels
const x = d3.scaleLinear()
  .domain(d3.extent(plotData, d => d.avg_net_price))
  .range([0, WIDTH]);

const y = d3.scaleLinear()
  .domain(d3.extent(plotData, d => d.earnings_10y_post_grad))
  .range([HEIGHT, 0]);

const color = d3.scaleThreshold()
  .domain([1, 2, 3])
  .range(OWNERSHIP_COLORS);

// Axes
svg.append('g')
  .attr('class', 'axis x-axis')
  .attr('transform', `translate(0,${HEIGHT})`)
  .call(d3.axisBottom(x).tickFormat(d => `$${d / 1000}K`));

svg.append('g')
  .attr('class', 'axis y-axis')
  .call(d3.axisLeft(y).tickFormat(d => `$${d / 1000}K`));

// Chart title 
svg.append('text')
  .attr('class', 'chart-title')
  .attr('x', -MARGIN.left + 10)     // left-aligned with the chart's outer edge
  .attr('y', -MARGIN.top + 22)      // baseline, measured from the top of the SVG
  .text('Cost vs. earnings');

// x-axis title
svg.append('text')
  .attr('class', 'axis-label')
  .attr('x', WIDTH / 2)
  .attr('y', HEIGHT + 40)
  .attr('text-anchor', 'middle')
  .text('Average net cost of attendance');

// y-axis title (rotated)
svg.append('text')
  .attr('class', 'axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('x', -HEIGHT / 2)
  .attr('y', -MARGIN.left + 16)
  .attr('text-anchor', 'middle')
  .text('Median earnings 10 years after graduation');

// Dots
svg.selectAll('.dot')
  .data(plotData, d => d.id)
  .join('circle')
  .attr('class', 'dot')
  .attr('cx', d => x(d.avg_net_price))
  .attr('cy', d => y(d.earnings_10y_post_grad))
  .attr('r', DOT_RADIUS)
  .attr('fill', d => color(d.ownership))
  .attr('opacity', 0.6)
  .style('cursor', 'pointer');

// Hover ring

const hoverRing = svg.append('circle')
  .attr('class', 'hover-ring')
  .attr('r', 11)                     // bigger than the selected dot (8)
  .attr('fill', 'none')
  .attr('stroke', 'black')
  .attr('stroke-width', 1.5)
  .style('pointer-events', 'none')   // never blocks dot hovers or clicks
  .style('display', 'none');

function showHoverRing(id) {
  const d = plotData.find(p => p.id === id);
  if (!d) return hideHoverRing();    // this college has no dot
  hoverRing
    .attr('cx', x(d.avg_net_price))
    .attr('cy', y(d.earnings_10y_post_grad))
    .style('display', null);
}

function hideHoverRing() {
  hoverRing.style('display', 'none');
}

/* ==========================================================================
   6. SCATTERPLOT TOOLTIP
   ========================================================================== */

const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'scatter-tooltip')
  .style('position', 'absolute')
  .style('pointer-events', 'none') // never blocks the mouse
  .style('opacity', 0);

// Place the tooltip to the left of a page position (x, y).
function placeTooltip(pageX, pageY) {
  const w = tooltip.node().offsetWidth;
  tooltip
    .style('left', `${pageX - w - 12}px`)
    .style('top', `${pageY - 28}px`);
}

/* ==========================================================================
   INFO PARAGRAPH
   ========================================================================== */
const info = d3.select('#info');

// Formatters that tolerate missing data
const fmtInt = v => (v == null ? '—' : d3.format(',')(v));
const fmtUSD = v => (v == null ? '—' : d3.format('$,.0f')(v));
const fmtPct = v => (v == null ? '—' : d3.format('.0%')(v));   // assumes 0–1 values

function showInfoPlaceholder() {
  info.html('');
  info.append('div')
    .attr('class', 'info-placeholder')
    .text('Click a college on the map or chart to see details.');
}

showInfoPlaceholder();

const b = v => `<strong>${v}</strong>`;

// Escape text from the data so a name containing & or < can't break the HTML
const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');


function infoParagraph(p) {
  const parts = [];

  if (p.student_pop != null)
    parts.push(`${esc(p.name)} enrolls about ${b(fmtInt(p.student_pop))} students.`);

  if (p.acceptance_rate != null)
    parts.push(`It admits ${b(fmtPct(p.acceptance_rate))} of applicants, and ${
      p.graduation_rate != null
        ? `${b(fmtPct(p.graduation_rate))} of students go on to graduate.`
        : 'graduation data is unavailable.'}`);
  else if (p.graduation_rate != null)
    parts.push(`${b(fmtPct(p.graduation_rate))} of students go on to graduate.`);

  if (p.avg_net_price != null)
    parts.push(`The average net price is ${b(fmtUSD(p.avg_net_price))} per year.`);

  if (p.earnings_10y_post_grad != null)
    parts.push(`Ten years after graduation, earnings average around ${b(fmtUSD(p.earnings_10y_post_grad))}.`);

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
   LEGEND
   ========================================================================== */


const legend = d3.select('#legend');

// --- Color: one row per ownership type found in the data ---
legend.append('div').attr('class', 'legend-title').text('Ownership');

const owners = Array.from(
  d3.group(geojson.features.map(f => f.properties).filter(p => p.ownership != null), p => p.ownership),
  ([ownership, rows]) => ({ ownership, label: rows[0].ownership_label })
).sort((a, b) => a.ownership - b.ownership);

const rows = legend.selectAll('.legend-row')
  .data(owners)
  .join('div')
  .attr('class', 'legend-row');

rows.append('span')
  .attr('class', 'legend-swatch')
  .style('background', d => color(d.ownership));
rows.append('span').text(d => d.label);

// --- Size: sample circles at example enrollments ---
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

/* ==========================================================================
   DROPDOWN
   ========================================================================== */

const collegeSelect = d3.select('#college-select');

const colleges = geojson.features
  .map(f => f.properties)
  .sort((a, b) => d3.ascending(a.name, b.name));

collegeSelect.append('option')
  .attr('value', '')
  .text('Select a college…');

collegeSelect.selectAll('.college-option')
  .data(colleges, d => d.id)
  .join('option')
  .attr('class', 'college-option')
  .attr('value', d => d.id)
  .text(d => d.name);

collegeSelect.on('change', function () {
  const option = this.selectedOptions[0];
  if (!option.value) return clearSelection();
  selectCollege(d3.select(option).datum().id, { fly: true });
});

/* ==========================================================================
   7. SELECTION LOGIC (the bridge between chart and map)
   Both views call selectCollege(id); it updates both.
   ========================================================================== */

function highlightDot(id) {
  svg.selectAll('.dot')
    .attr('fill', d => (d.id === id ? SELECTED_COLOR : color(d.ownership)))
    .attr('r', d => (d.id === id ? DOT_RADIUS_SELECTED : DOT_RADIUS));
}

function flyToId(id) {
  map.flyTo({ center: featureById.get(id).geometry.coordinates, zoom: 10 });
}

function popupHTML({ name, ownership_label }) {
  return `
    <span class="college-name">${name}</span><br>
    <span class="ownership-label">${ownership_label}</span>`;
}

function selectCollege(id, { fly = false } = {}) {
  const feature = featureById.get(id);
  if (!feature) return;

  selectedId = id;
  collegeSelect.property('value', id); 
  showInfo(feature.properties);
  hoverPopup.remove(); // avoid two identical popups
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
   8. SCATTERPLOT EVENTS
   ========================================================================== */

svg.selectAll('.dot')
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


/* ==========================================================================
   9. MAP LAYERS AND EVENTS
   ========================================================================== */

map.on('load', () => {

  // --- Source and layer ---------------------------------------------------
  map.addSource('colleges', {
    type: 'geojson',
    data: geojson, // same object as the chart, so ids match
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
  }, 'cities'); // draw beneath the 'cities' layer

  // --- Hover --------------------------------------------------------------
  let hoveredFeatureId = null; // MapLibre's generated id, used for feature-state

  function clearHoverState() {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: false });
      hoveredFeatureId = null;
    }
  }

  map.on('mousemove', 'colleges', (e) => {
  const feature = e.features[0];
  showHoverRing(feature.properties.id);   // <-- new

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

  // --- Click --------------------------------------------------------------
  // One handler: clicking a college selects it, clicking empty map clears.
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['colleges'] });
    if (hits.length) selectCollege(hits[0].properties.id, {fly: true});
    else clearSelection();
  });
});