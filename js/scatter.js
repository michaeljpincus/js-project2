import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import {
  MARGIN, MIN_PLOT_HEIGHT, DOT_RADIUS, DOT_RADIUS_SELECTED, SELECTED_COLOR, color
} from './config.js';
import { plotData, plotById } from './data.js';
import { fmtK } from './helpers.js';

/* ==========================================================================
   SCATTERPLOT: structure, responsive layout, hover ring and tooltip.
   This module knows nothing about the map or the selection logic. Anything
   that needs them is passed in as a callback to initScatterEvents().
   ========================================================================== */

const scatterBox = document.getElementById('scatter');

let WIDTH = 500 - MARGIN.left - MARGIN.right;
let HEIGHT = 420 - MARGIN.top - MARGIN.bottom;

/* --------------------------------------------------------------------------
   Structure (sizes and positions are set in updateChart)
   -------------------------------------------------------------------------- */

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

// Tooltip
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

  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  // Convert page coordinates to viewport coordinates.
  const x = pageX - window.scrollX;
  const y = pageY - window.scrollY;

  // Prefer the left, but flip right if it won't fit.
  let left = x - w - gap;

  if (left < padding) {
    left = x + gap;
  }

  // Keep the tooltip inside the horizontal viewport.
  left = Math.max(
    padding,
    Math.min(left, viewportWidth - w - padding)
  );

  // Position above the pointer, but move below if necessary.
  let top = y - h - gap;

  if (top < padding) {
    top = y + gap;
  }

  // Keep the tooltip inside the vertical viewport.
  top = Math.max(
    padding,
    Math.min(top, viewportHeight - h - padding)
  );

  tooltip
    .style('left', `${left + window.scrollX}px`)
    .style('top', `${top + window.scrollY}px`);
}

/* --------------------------------------------------------------------------
   Responsive layout: fit the plot to whatever space the container has.
   Only the plot's dimensions change; text and circles stay at normal size.
   -------------------------------------------------------------------------- */

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

/** Draw the first layout and keep it in sync with the container's size. */
export function initScatter() {
  new ResizeObserver(updateChart).observe(scatterBox);
  updateChart();
}

/* --------------------------------------------------------------------------
   Hover ring, highlighting and filtering
   -------------------------------------------------------------------------- */

export function showHoverRing(id) {
  const d = plotById.get(id);
  if (!d) return hideHoverRing();    // this college has no dot
  hoverRing
    .attr('cx', x(d.avg_net_price))
    .attr('cy', y(d.earnings_10y_post_grad))
    .style('display', null);
}

export function hideHoverRing() {
  hoverRing.style('display', 'none');
}

/** Color the selected dot crimson and enlarge it. Pass null to clear. */
export function highlightDot(id) {
  dots
    .attr('fill', d => (d.id === id ? SELECTED_COLOR : color(d.ownership)))
    .attr('r', d => (d.id === id ? DOT_RADIUS_SELECTED : DOT_RADIUS));
}

/** Show only the dots whose data passes `predicate`. Axes stay fixed. */
export function filterDots(predicate) {
  dots.attr('display', d => (predicate(d) ? null : 'none'));
  hideHoverRing();
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

/** onSelect(id) is called when a dot is clicked. */
export function initScatterEvents({ onSelect }) {
  dots
    .on('click', (event, d) => {
      onSelect(d.id);
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
