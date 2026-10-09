import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { radiusScale, color } from './config.js';
import { allProps } from './data.js';
import { bold, esc, fmtInt, fmtUSD, fmtPct } from './helpers.js';

/* ==========================================================================
   PANELS: the info card, the legend and the college dropdown.
   This module knows nothing about selection logic. The dropdown reports
   user choices through callbacks passed to buildDropdown().
   ========================================================================== */

const info = d3.select('#info');
const legend = d3.select('#legend');
const collegeSelect = d3.select('#college-select');


/* --------------------------------------------------------------------------
   Info panel
   -------------------------------------------------------------------------- */

export function showInfoPlaceholder() {
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

export function showInfo(p) {
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


/* --------------------------------------------------------------------------
   Legend
   -------------------------------------------------------------------------- */

export function buildLegend() {
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


/* --------------------------------------------------------------------------
   Dropdown
   -------------------------------------------------------------------------- */

/**
 * Fill the dropdown and report choices.
 *   onSelect(id)  a college was chosen
 *   onClear()     the empty "Select a college…" option was chosen
 */
export function buildDropdown({ onSelect, onClear }) {
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
    if (!option.value) return onClear();
    onSelect(d3.select(option).datum().id);
  });
}

/** Keep the dropdown in sync with the current selection ('' for none). */
export function setDropdownValue(id) {
  collegeSelect.property('value', id);
}
