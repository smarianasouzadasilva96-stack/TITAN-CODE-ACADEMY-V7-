import { el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const tones = ['#f4b7d6','#f6b5a2','#ed9cd2','#b49bf6','#9dd5ef','#f5d68c'];

function shape(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export function petArtwork(pet, celebrate = false) {
  const stage = pet.stage;
  const body = tones[stage] || tones[0];
  const svg = shape('svg', { viewBox: '0 0 120 120', fill: 'none', 'aria-hidden': 'true' });
  const path = (d, attrs = {}) => shape('path', { d, ...attrs });
  const ellipse = (cx, cy, rx, ry, fill) => shape('ellipse', { cx, cy, rx, ry, fill });
  if (stage <= 1) {
    svg.append(path('M60 16C78 16 95 46 95 69c0 21-14 34-35 34S25 90 25 69c0-23 17-53 35-53z',
      { fill: body, stroke: '#ebdfff', 'stroke-width': 2 }));
    svg.append(ellipse(45, 50, 9, 20, '#ffffff41'), path(stage
      ? 'm30 69 17-12 12 11 9-20 12 9 12-4' : 'm60 50 4 9 9 4-9 4-4 9-4-9-9-4 9-4z',
    { fill: stage ? 'none' : '#f2e9ff', stroke: '#f2e9ff', 'stroke-width': 2.2 }));
  } else {
    if (stage >= 4) svg.append(path('M42 83 14 65l11-29 26 20m27 27 28-18-11-29-26 20',
      { fill: body, stroke: '#fff', 'stroke-width': 1.3, opacity: .62 }));
    if (stage === 5) svg.append(ellipse(60, 17, 24, 7, '#ffda8466'));
    svg.append(path(stage >= 3 ? 'M37 51 27 26l23 10q10-4 20 0l23-10-10 25q11 12 10 29c-1 18-17 23-33 23s-32-5-33-23q-1-17 10-29z'
      : 'M60 34c19 0 34 17 34 38 0 20-12 31-34 31S26 92 26 72c0-21 15-38 34-38z',
    { fill: body, stroke: '#e6ebff', 'stroke-width': 2 }));
    svg.append(ellipse(50, 66, 4, 6, '#161a37'), ellipse(70, 66, 4, 6, '#161a37'),
      ellipse(42, 77, 5, 2.5, '#fb70b7'), ellipse(78, 77, 5, 2.5, '#fb70b7'),
      path('M54 79q6 7 12 0', { stroke: '#21254b', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  }
  if (stage >= 2) svg.append(path('M43 102q17 17 34 0', { stroke: '#fff6', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  if (pet.accessory === 'star') svg.append(path('m96 12 3 8 8 3-8 3-3 8-3-8-8-3 8-3z', { fill: '#ffe37e' }));
  if (pet.accessory === 'crown') svg.append(path('m41 9 10 7 9-11 9 11 10-7-4 18H45z', { fill: '#ffd56e', stroke: '#ffefa5' }));
  return el('div', { class: 'pet-art has-motion' + (celebrate ? ' celebrate' : ''), 'aria-hidden': 'true' },
    el('div', { class: 'pet-ring' }), svg);
}
