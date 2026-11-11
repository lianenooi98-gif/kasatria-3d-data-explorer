import * as THREE from 'three';

import {
  CSS3DRenderer,
  CSS3DObject
} from 'three/addons/renderers/CSS3DRenderer.js';

import {
  TrackballControls
} from 'three/addons/controls/TrackballControls.js';

import './style.css';

/* ===================================
   CONFIGURATION
=================================== */

const CONFIG = {
  CLIENT_ID:
    '807232230568-l7aqog3m6jina904s1pvnuqtvdkdtrc3.apps.googleusercontent.com',

  SPREADSHEET_ID:
    '1oBJwJg2ozItCVfqBuUVKdiwCZxDS6EV0Yxsfkh7UjbM',

  RANGE: "'Data Template'!A:Z",

  MAX_RECORDS: 200
};

let accessToken = null;
let records = [];
let objects = [];
let currentLayout = 'table';
let animationFrame = null;
let tokenClient = null;

/* ===================================
   HTML ELEMENTS
=================================== */

const statusElement = document.getElementById('status');
const loginButton = document.getElementById('login');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');

const layoutButtons = document.querySelectorAll('[data-layout]');

/* ===================================
   THREE.JS INITIALIZATION
=================================== */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  1,
  10000
);

camera.position.set(0, 0, 3400);

const renderer = new CSS3DRenderer();

renderer.setSize(
  window.innerWidth,
  window.innerHeight
);

const container = document.createElement('div');
container.className = 'three-container';

container.appendChild(renderer.domElement);
document.body.appendChild(container);

const controls = new TrackballControls(
  camera,
  renderer.domElement
);

controls.rotateSpeed = 1.2;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

controls.minDistance = 500;
controls.maxDistance = 8000;

/* ===================================
   GOOGLE AUTHENTICATION
=================================== */

function signIn() {
  errorElement.style.display = 'none';

  if (!window.google?.accounts?.oauth2) {
    showError(
      'Google authentication is still loading. Please try again.'
    );
    return;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,

    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',

    callback: async (response) => {
      if (response.error) {
        showError(
          'Google login failed: ' + response.error
        );
        return;
      }

      accessToken = response.access_token;

      statusElement.textContent =
        'Google authenticated. Loading spreadsheet...';

      loginButton.textContent = 'Connected to Google';
      loginButton.disabled = true;

      await loadSpreadsheet();
    }
  });

  tokenClient.requestAccessToken();
}

loginButton.addEventListener('click', signIn);

/* ===================================
   GOOGLE SHEETS DATA RETRIEVAL
=================================== */

async function loadSpreadsheet() {
  loadingElement.style.display = 'flex';
  loadingElement.textContent = 'Loading spreadsheet data...';

  try {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/` +
      `${CONFIG.SPREADSHEET_ID}/values/` +
      `${encodeURIComponent(CONFIG.RANGE)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Google Sheets API error (${response.status}): ${errorText}`
      );
    }

    const result = await response.json();

    if (!result.values || result.values.length < 2) {
      throw new Error(
        'The spreadsheet has no data rows. Check the sheet tab and range.'
      );
    }

    const headers = result.values[0].map(header =>
      String(header).trim()
    );

    records = result.values
      .slice(1)
      .filter(row =>
        row.some(value => String(value ?? '').trim() !== '')
      )
      .slice(0, CONFIG.MAX_RECORDS)
      .map(row => {
        const item = {};

        headers.forEach((header, index) => {
          if (header) {
            item[header] = row[index] ?? '';
          }
        });

        return item;
      });

    if (records.length === 0) {
      throw new Error('No valid records were found.');
    }

    createElements();

    statusElement.textContent =
      `${records.length} records successfully loaded from Google Sheets`;

    loadingElement.style.display = 'none';

    changeLayout('table');

  } catch (error) {
    console.error(error);

    loadingElement.style.display = 'none';

    showError(
      'Unable to load spreadsheet: ' + error.message
    );
  }
}

/* ===================================
   DATA HELPERS
=================================== */

function getNetWorthField(item) {
  return Object.keys(item).find(key =>
    /net[\s_-]*worth/i.test(key)
  );
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return value;
  }

  const cleaned = String(value ?? '')
    .replace(/[$,\s]/g, '')
    .trim();

  if (!cleaned) {
    return 0;
  }

  const match = cleaned.match(/^(-?[\d.]+)([KMB])?$/i);

  if (!match) {
    return 0;
  }

  const multipliers = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  const multiplier =
    multipliers[(match[2] || '').toUpperCase()] || 1;

  return Number(match[1]) * multiplier;
}

function getColor(item) {
  const field = getNetWorthField(item);

  if (!field) {
    return '#475569';
  }

  const amount = parseMoney(item[field]);

  if (amount < 100000) {
    return '#ef4444';
  }

  if (amount <= 200000) {
    return '#f59e0b';
  }

  return '#22c55e';
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

/* ===================================
   CREATE 3D DATA OBJECTS
=================================== */

function createElements() {
  objects.forEach(object => {
    scene.remove(object);
  });

  objects = [];

  records.forEach((record, index) => {
    const element = document.createElement('div');

    element.className = 'element';
    element.style.background = getColor(record);

    const fields = Object.entries(record);

    const nameField = Object.keys(record).find(key =>
      /name|company|person|customer/i.test(key)
    );

    const title = nameField
      ? record[nameField]
      : `Record ${index + 1}`;

    const details = fields
      .filter(([key]) => key !== nameField && key !== 'Photo')
      .slice(0, 4)
      .map(([key, value]) => {
        return `
          <div>
            <b>${escapeHTML(key)}:</b>
            ${escapeHTML(value)}
          </div>
        `;
      })
      .join('');

    
    const imageUrl = String(record['Photo'] ?? '').trim();
    console.log('Image URL:', imageUrl);

    element.innerHTML = `
      <div class="number">#${index + 1}</div>

      ${/^https?:\/\//i.test(imageUrl) ? `
        <img
          class="record-image"
          src="${escapeHTML(imageUrl)}"
          alt="${escapeHTML(title)}"
        >
      ` : ''}

      <div class="name">
        ${escapeHTML(title)}
      </div>

      <div class="details">
        ${details}
      </div>
    `;

    const img = element.querySelector('.record-image');

    if (img) {
      img.onload = () => {
        console.log('Image loaded:', img.src);
      };

      img.onerror = () => {
        console.error('Image failed to load:', img.src);
      };
    }
    const object = new CSS3DObject(element);

    object.userData.index = index;
    object.position.set(0, 0, 0);

    scene.add(object);
    objects.push(object);
  });

  createLayouts();
}

/* ===================================
   FOUR LAYOUTS
=================================== */

const layouts = {
  table: [],
  sphere: [],
  helix: [],
  grid: []
};

function createLayouts() {
  const count = objects.length;

  layouts.table = [];
  layouts.sphere = [];
  layouts.helix = [];
  layouts.grid = [];

  objects.forEach((object, i) => {

    /* TABLE: 20 COLUMNS x 10 ROWS */

    const tableX = (i % 20) * 180 - 1710;
    const tableY = -Math.floor(i / 20) * 135 + 607;

    layouts.table.push({
      position: new THREE.Vector3(
        tableX,
        tableY,
        0
      ),

      rotation: new THREE.Euler(0, 0, 0)
    });

    /* SPHERE */

    const phi = Math.acos(
      -1 + (2 * i + 1) / count
    );

    const theta = Math.sqrt(count * Math.PI) * phi;

    const radius = 900;

    layouts.sphere.push({
      position: new THREE.Vector3(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.cos(phi),
        radius * Math.sin(theta) * Math.sin(phi)
      ),

      rotation: new THREE.Euler(0, 0, 0)
    });

    /* DOUBLE HELIX */

    const strand = i % 2;
    const step = Math.floor(i / 2);

    const angle = step * 0.22 + strand * Math.PI;

    const helixRadius = 650;

    const helixY =
      (step - Math.ceil(count / 2) / 2) * 22;

    layouts.helix.push({
      position: new THREE.Vector3(
        helixRadius * Math.cos(angle),
        helixY,
        helixRadius * Math.sin(angle)
      ),

      rotation: new THREE.Euler(
        0,
        -angle,
        0
      )
    });

    /* GRID: 5 x 4 x 10 */

    const x = i % 5;
    const y = Math.floor(i / 5) % 4;
    const z = Math.floor(i / 20);

    layouts.grid.push({
      position: new THREE.Vector3(
        (x - 2) * 220,
        (1.5 - y) * 180,
        (z - 4.5) * 240
      ),

      rotation: new THREE.Euler(0, 0, 0)
    });

  });
}

/* ===================================
   ANIMATED LAYOUT TRANSITIONS
=================================== */

function changeLayout(layout) {
  if (!objects.length) {
    showError(
      'Please sign in and load your spreadsheet first.'
    );
    return;
  }

  if (!layouts[layout]) {
    return;
  }

  currentLayout = layout;

  layoutButtons.forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.layout === layout
    );
  });

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  const starts = objects.map(object => ({
    position: object.position.clone(),
    quaternion: object.quaternion.clone()
  }));

  const ends = layouts[layout].map(target => ({
    position: target.position.clone(),

    quaternion: new THREE.Quaternion()
      .setFromEuler(target.rotation)
  }));

  const startTime = performance.now();
  const duration = 1000;

  function animate(now) {
    const progress = Math.min(
      (now - startTime) / duration,
      1
    );

    const eased = 1 - Math.pow(1 - progress, 3);

    objects.forEach((object, i) => {
      object.position.lerpVectors(
        starts[i].position,
        ends[i].position,
        eased
      );

      object.quaternion.slerpQuaternions(
        starts[i].quaternion,
        ends[i].quaternion,
        eased
      );
    });

    if (progress < 1) {
      animationFrame = requestAnimationFrame(animate);
    }
  }

  animationFrame = requestAnimationFrame(animate);
}

layoutButtons.forEach(button => {
  button.addEventListener('click', () => {
    changeLayout(button.dataset.layout);
  });
});

/* ===================================
   RESET CAMERA
=================================== */

function resetView() {
  camera.position.set(0, 0, 3400);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  controls.reset();
}

document.getElementById('reset').addEventListener(
  'click',
  resetView
);

/* ===================================
   ERROR HANDLING
=================================== */

function showError(message) {
  errorElement.textContent = message;
  errorElement.style.display = 'block';
}

/* ===================================
   RENDER LOOP
=================================== */

function render() {
  requestAnimationFrame(render);

  controls.update();
  renderer.render(scene, camera);
}

render();

/* ===================================
   RESPONSIVE RESIZING
=================================== */

window.addEventListener('resize', () => {
  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  controls.handleResize();
});