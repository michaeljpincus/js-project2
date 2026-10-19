import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import * as maplibregl from 'https://unpkg.com/maplibre-gl@^6.12.0/dist/maplibre-gl.mjs';

/* ==========================================================================
   CONFIG
   ========================================================================== */

const INITIAL_CENTER = [-75.93286341656814, 42.6617285841208];
const INITIAL_ZOOM = 6.5;
const isMobile = window.matchMedia('(max-width: 768px)').matches;

// Index 0 is the fallback, then ownership 1, 2, 3
const OWNERSHIP_COLORS = ['gray', '#009E73', '#0072B2', '#E69F00'];
const SELECTED_COLOR = 'crimson';

const DOT_RADIUS = 4;
const DOT_RADIUS_SELECTED = 8;
const MARGIN_DESKTOP = { top: 40, right: 20, bottom: 50, left: 70 };
const MARGIN_MOBILE  = { top: 36, right: 12, bottom: 46, left: 60 };
let MARGIN = MARGIN_DESKTOP;
const MIN_PLOT_HEIGHT = 80;

const STUDENT_MAX = 100000;
const radiusScale = d3.scaleLinear().domain([0, STUDENT_MAX]).range([5, 100]);
const color = d3.scaleThreshold().domain([1, 2, 3]).range(OWNERSHIP_COLORS);

/* ==========================================================================
   HELPERS
   ========================================================================== */

const fmtInt = v => (v == null ? '—' : d3.format(',')(v));
const fmtUSD = v => (v == null ? '—' : d3.format('$,.0f')(v));
const fmtPct = v => (v == null ? '—' : d3.format('.0%')(v));
const fmtK = v => `$${v / 1000}K`;

const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const popupHTML = ({ name, ownership_label }) => `
  <span class="college-name">${esc(name)}</span><br>
  <span class="ownership-label">${esc(ownership_label)}</span>`;

/* ==========================================================================
   DATA
   ========================================================================== */

const geojson = await d3.json('colleges.geojson');

geojson.features.forEach((f, i) => {
  f.properties.id = f.properties.id ?? i;
});

const allProps = geojson.features.map(f => f.properties);
const featureById = new Map(geojson.features.map(f => [f.properties.id, f]));

// Colleges missing either value still appear on the map but not in the chart
const plotData = allProps.filter(
  d => d.avg_net_price != null && d.earnings_10y_post_grad != null
);
const plotById = new Map(plotData.map(d => [d.id, d]));

let selectedId = null;

/* ==========================================================================
   INFO PANEL, LEGEND, DROPDOWN
   ========================================================================== */

const info = d3.select('#info');
const legend = d3.select('#legend');
const collegeSelect = d3.select('#college-select');

// Builds the placeholder 
function showInfoPlaceholder() {
  info.html('');
  info.append('div')
    .attr('class', 'info-placeholder')
    .text('Click a college on the map or chart to see data from the 2026 U.S. Department of Education College Scorecard.');
}
// Builds the infor paragraph
function infoParagraph(p) {
  const parts = [];

  if (p.student_pop != null)
    parts.push(`${esc(p.name)} enrolls about ${fmtInt(p.student_pop)} students.`);

  if (p.acceptance_rate != null)
    parts.push(`It admits ${fmtPct(p.acceptance_rate)} of applicants, and ${
      p.graduation_rate != null
        ? `${fmtPct(p.graduation_rate)} of students go on to graduate.`
        : 'graduation data is unavailable.'}`);
  else if (p.graduation_rate != null)
    parts.push(`${fmtPct(p.graduation_rate)} of students go on to graduate.`);

  if (p.avg_net_price != null)
    parts.push(`The average net price is ${fmtUSD(p.avg_net_price)} per year.`);

  if (p.earnings_10y_post_grad != null)
    parts.push(`Ten years after graduation, earnings average around ${fmtUSD(p.earnings_10y_post_grad)}.`);

  return parts.length ? parts.join(' ') : 'No additional data is available for this college.';
}

// Shows the info paragraph 
function showInfo(p) {
  info.html('');

  if (p.image_url) {
    info.append('img')
      .attr('class', 'info-photo')
      .attr('src', p.image_url)
      .attr('alt', `Photo of ${p.name}`)
      .on('error', function () { this.remove(); });
  }

  info.append('h2').attr('class', 'info-name').text(p.name);
  info.append('div').attr('class', 'info-type').text(p.ownership_label);
  info.append('p').attr('class', 'info-text').html(infoParagraph(p));
}

// Builds the legend 
function buildLegend() {
  legend.append('div').attr('class', 'legend-title').text('Ownership');

  const owners = Array.from(
    d3.group(allProps.filter(p => p.ownership != null), p => p.ownership),
    ([ownership, group]) => ({ ownership, label: group[0].ownership_label })
  ).sort((a, b) => a.ownership - b.ownership);

  const rows = legend.selectAll('.legend-row')
    .data(owners)
    .join('div')
    .attr('class', 'legend-row');

  rows.append('span')
    .attr('class', 'legend-swatch')
    .style('background', d => color(d.ownership));
  rows.append('span').text(d => d.label);

  // Size legend: sample circles scaled to the actual data
  legend.append('div').attr('class', 'legend-title').text('Enrollment');

  const maxPop = d3.max(allProps, p => p.student_pop);
  const mag = 10 ** Math.floor(Math.log10(maxPop));
  const top = Math.floor(maxPop / mag) * mag;
  const samples = [top / 10, top / 2, top];

  const sizes = legend.append('div')
    .attr('class', 'legend-sizes')
    .selectAll('.legend-size')
    .data(samples)
    .join('div')
    .attr('class', 'legend-size');

  sizes.append('div')
    .attr('class', 'legend-circle')
    .style('width', d => `${2 * radiusScale(d)}px`)
    .style('height', d => `${2 * radiusScale(d)}px`);
  sizes.append('div').text(d => d3.format(',')(d));
}

// Builds the dropdown of all colleges 
function buildDropdown() {
  const sorted = [...allProps].sort((a, b) => d3.ascending(a.name, b.name));

  collegeSelect.append('option').attr('value', '').text('Select a college…');

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
   SCATTERPLOT
   ========================================================================== */

const scatterBox = document.getElementById('scatter');

let WIDTH = 500 - MARGIN.left - MARGIN.right;
let HEIGHT = 420 - MARGIN.top - MARGIN.bottom;

const svgRoot = d3.select('#scatter').append('svg');
const svg = svgRoot.append('g')
  .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

const x = d3.scaleLinear().domain(d3.extent(plotData, d => d.avg_net_price));
const y = d3.scaleLinear().domain(d3.extent(plotData, d => d.earnings_10y_post_grad));

const xAxisG = svg.append('g').attr('class', 'axis x-axis');
const yAxisG = svg.append('g').attr('class', 'axis y-axis');

const xLabel = svg.append('text')
  .attr('class', 'axis-label')
  .attr('text-anchor', 'middle')
  .text('Average net cost of attendance');

const yLabel = svg.append('text')
  .attr('class', 'axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('y', -MARGIN.left + 16)
  .attr('text-anchor', 'middle')

const Y_LABELS = [
  'Median earnings 10 years after graduation',
  'Earnings 10 years after graduation',
  'Earnings after 10 years',
  'Earnings'
];

const chartTitle = svg.append('text')
  .attr('class', 'chart-title')
  .text('Cost vs. earnings');

const dots = svg.selectAll('.dot')
  .data(plotData, d => d.id)
  .join('circle')
  .attr('class', 'dot')
  .attr('r', DOT_RADIUS)
  .attr('fill', d => color(d.ownership))
  .attr('opacity', 0.6)
  .style('cursor', 'pointer');

// Ring drawn around a dot when hovering its college on the map
const hoverRing = svg.append('circle')
  .attr('class', 'hover-ring')
  .attr('r', 11)
  .attr('fill', 'none')
  .attr('stroke', 'black')
  .attr('stroke-width', 1.5)
  .style('pointer-events', 'none')
  .style('display', 'none');

const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'scatter-tooltip')
  .style('position', 'absolute')
  .style('pointer-events', 'none')
  .style('opacity', 0);

function placeTooltip(pageX, pageY) {
  const node = tooltip.node();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const padding = 8;
  const gap = 12;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const px = pageX - window.scrollX;
  const py = pageY - window.scrollY;

  let left = px - w - gap;                 // prefer left of the pointer
  if (left < padding) left = px + gap;
  left = Math.max(padding, Math.min(left, vw - w - padding));

  let top = py - h - gap;                  // prefer above the pointer
  if (top < padding) top = py + gap;
  top = Math.max(padding, Math.min(top, vh - h - padding));

  tooltip
    .style('left', `${left + window.scrollX}px`)
    .style('top', `${top + window.scrollY}px`);
}

function updateChart() {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  MARGIN = mobile ? MARGIN_MOBILE : MARGIN_DESKTOP;

  const cs = getComputedStyle(scatterBox);
  const availW = scatterBox.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = scatterBox.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  WIDTH = Math.max(100, availW - MARGIN.left - MARGIN.right);
  HEIGHT = Math.max(20, availH - MARGIN.top - MARGIN.bottom);

  svgRoot
    .attr('width', WIDTH + MARGIN.left + MARGIN.right)
    .attr('height', HEIGHT + MARGIN.top + MARGIN.bottom);
  svg.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  chartTitle.attr('x', -MARGIN.left + 10).attr('y', -MARGIN.top + 22);

  x.range([0, WIDTH]);
  y.range([HEIGHT, 0]);

  xAxisG
    .attr('transform', `translate(0,${HEIGHT})`)
    .call(d3.axisBottom(x).ticks(Math.max(3, WIDTH / 70)).tickFormat(fmtK));
  yAxisG
    .call(d3.axisLeft(y).ticks(Math.max(2, HEIGHT / 40)).tickFormat(fmtK));

  xLabel.attr('x', WIDTH / 2).attr('y', HEIGHT + 38);

  // Use the longest y-label that fits within the plot height
  yLabel.attr('y', -MARGIN.left + 14).attr('x', -HEIGHT / 2);
  for (const txt of Y_LABELS) {
    yLabel.text(txt);
    if (yLabel.node().getComputedTextLength() <= HEIGHT) break;
  }

  dots
    .attr('cx', d => x(d.avg_net_price))
    .attr('cy', d => y(d.earnings_10y_post_grad));

  hideHoverRing();
}

function showHoverRing(id) {
  const d = plotById.get(id);
  if (!d) return hideHoverRing();
  hoverRing
    .attr('cx', x(d.avg_net_price))
    .attr('cy', y(d.earnings_10y_post_grad))
    .style('display', null);
}

function hideHoverRing() {
  hoverRing.style('display', 'none');
}

function highlightDot(id) {
  dots
    .attr('fill', d => (d.id === id ? SELECTED_COLOR : color(d.ownership)))
    .attr('r', d => (d.id === id ? DOT_RADIUS_SELECTED : DOT_RADIUS));
}

dots
  .on('click', (event, d) => selectCollege(d.id, { fly: true }))
  .on('mouseover', function (event, d) {
    d3.select(this).attr('stroke', 'black').attr('stroke-width', 1.5);
    tooltip.style('opacity', 1).text(d.name);
  })
  .on('mousemove', event => placeTooltip(event.pageX, event.pageY))
  .on('mouseleave', function () {
    d3.select(this).attr('stroke', null);
    tooltip.style('opacity', 0);
  });

/* ==========================================================================
   MAP
   ========================================================================== */

const resetButton = document.getElementById('reset-zoom');

const map = new maplibregl.Map({
  container: 'map',
  center: INITIAL_CENTER,
  zoom: isMobile ? 5 : INITIAL_ZOOM,
  minZoom: isMobile ? 3 : 5.5,
  style: 'https://michaeljpincus.github.io/basemap/basemap.json'
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '400px' });
const selectedPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '400px' });

function addCollegeLayer() {
  map.addSource('colleges', { type: 'geojson', data: geojson, generateId: true });

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
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.6],
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'student_pop'],
        0, radiusScale(0),
        STUDENT_MAX, radiusScale(STUDENT_MAX)
      ]
    }
  }, 'neighborhoods');   // draw beneath the 'cities' layer
}

function addMapEvents() {
  let hoveredFeatureId = null;   // MapLibre's generated id, used for feature-state

  function clearHoverState() {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: false });
      hoveredFeatureId = null;
    }
  }

  map.on('mousemove', 'colleges', e => {
    const feature = e.features[0];
    showHoverRing(feature.properties.id);

    if (hoveredFeatureId !== feature.id) clearHoverState();
    hoveredFeatureId = feature.id;
    map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: true });

    map.getCanvas().style.cursor = 'pointer';

    // The selected college already has its own popup
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

  // Click a college to select it, or empty map to clear
  map.on('click', e => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['colleges'] });
    if (hits.length) selectCollege(hits[0].properties.id, { fly: true });
    else clearSelection();
  });

  map.on('zoom', () => {
    const away = Math.abs(map.getZoom() - INITIAL_ZOOM) > 0.05;
    resetButton.style.display = away ? 'block' : 'none';
  });

  map.on('move', () => {
    const c = map.getCenter();
    const away =
      Math.abs(map.getZoom() - INITIAL_ZOOM) > 0.05 ||
      Math.abs(c.lng - INITIAL_CENTER[0]) > 0.05 ||
      Math.abs(c.lat - INITIAL_CENTER[1]) > 0.05;
    resetButton.style.display = away ? 'block' : 'none';
  });

  resetButton.addEventListener('click', () => {
    clearSelection();
    map.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM, duration: 1000 });
  });
}

/* ==========================================================================
   SELECTION: updates the map, chart, dropdown and info panel together
   ========================================================================== */

function selectCollege(id, { fly = false } = {}) {
  const feature = featureById.get(id);
  if (!feature) return;

  selectedId = id;
  collegeSelect.property('value', id);
  showInfo(feature.properties);
  hoverPopup.remove();
  highlightDot(id);

  selectedPopup
    .setLngLat(feature.geometry.coordinates)
    .setHTML(popupHTML(feature.properties))
    .addTo(map);

  if (fly) map.flyTo({ center: feature.geometry.coordinates, zoom: 10 });
}

function clearSelection() {
  selectedId = null;
  selectedPopup.remove();
  collegeSelect.property('value', '');
  showInfoPlaceholder();
  highlightDot(null);
}

/* ==========================================================================
   START
   ========================================================================== */

buildLegend();
showInfoPlaceholder();
buildDropdown();

new ResizeObserver(updateChart).observe(scatterBox);
updateChart();

map.on('load', () => {

  // Stopping attribution from automatically popping up
  const attrib = document.querySelector('.maplibregl-ctrl-attrib');
  attrib?.classList.remove('maplibregl-compact-show');
  attrib?.removeAttribute('open');

  addCollegeLayer();
  addMapEvents();
});