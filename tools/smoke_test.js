// 临时冒烟测试：用最小 DOM 桩加载 slots.js + data.js + script.js，跑一遍关键交互路径
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function makeEl(id) {
  const el = {
    id,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    width: 900,
    height: 900,
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {},
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => makeEl('q'),
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 200, left: 0, top: 0, right: 300, bottom: 200 }),
    scrollIntoView() {},
    focus() {},
    getContext: () => ctx2d,
    toDataURL: () => '',
    insertAdjacentHTML() {},
    contains: () => false,
  };
  return el;
}
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 900, height: 900 };
    if (['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline'].includes(k)) return t[k];
    return () => ({ addColorStop() {}, width: 10 });
  },
  set(t, k, v) { t[k] = v; return true; },
});

const elements = {};
const document = {
  getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
  querySelector(sel) { return makeEl(sel); },
  querySelectorAll(sel) {
    if (sel === '.nightlord-btn') return nightlordBtns;
    if (sel === '.map-btn') return mapBtns;
    return [];
  },
  createElement: (t) => makeEl(t),
  addEventListener() {},
  body: makeEl('body'),
  documentElement: makeEl('html'),
};
const nightlordBtns = ['Gladius', 'Adel', 'Gnoster', 'Maris', 'Libra', 'Fulghor', 'Caligo', 'Heolstor', 'Harmonia', 'Straghess']
  .map(n => { const e = makeEl('nl-' + n); e.dataset = { nightlord: n }; return e; });
const mapBtns = ['Default', 'Mountaintop', 'Crater', 'Rotted Woods', 'Noklateo', 'Hollow']
  .map(m => { const e = makeEl('map-' + m); e.dataset = { map: m }; return e; });

const ctx = {
  console,
  document,
  window: { innerWidth: 1600, innerHeight: 1000, addEventListener() {}, location: { search: '' } },
  Image: class { constructor() { this.complete = true; this.naturalWidth = 32; } set src(v) { this._src = v; } get src() { return this._src; } },
  fetch: async (u) => {
    const p = path.join(root, u);
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
  },
  setTimeout, clearTimeout, URLSearchParams,
  location: { search: '', href: 'http://localhost:8000/index.html' },
  alert: () => {}, localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame: (f) => setTimeout(f, 0),
};
ctx.globalThis = ctx;
ctx.window.document = document;
vm.createContext(ctx);

for (const f of ['assets/data/slots.js', 'data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8') + (f.endsWith('slots.js') ? '\n;globalThis.__slots = { MAPS, POIS_BY_MAP, TYPE_INFO };' : ''), ctx, { filename: f });
} 
const { MAPS, POIS_BY_MAP } = ctx.__slots;
// script.js 末尾有 DOMContentLoaded 注册，桩里不会触发；手动实例化
const scriptSrc = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
vm.runInContext(scriptSrc + '\n;globalThis.__cls = NightreignMapRecogniser;', ctx, { filename: 'script.js' });
const NightreignMapRecogniser = ctx.__cls;

(async () => {
  const app = new NightreignMapRecogniser();
  await app.loadInitialData();
  for (const map of MAPS) {
    app.chosenMap = map;
    app.chosenNightlord = 'Harmonia';
    app.currentPOIs = POIS_BY_MAP[map];
    app.poiStates = app.initializePOIStates();
    app.updateSeedFiltering();
    console.log(`[ok] ${map}: 候选种子 ${app.availableSeeds.length}`);
    // 模拟一次右键菜单渲染 + 选择第一个候选类型
    const poi = app.currentPOIs[0];
    app.currentRightClickedPOI = poi;
    app.showContextMenu(100, 100);
    if (!app.contextMenu.innerHTML.includes('context-menu-item')) errors.push(`${map}: 菜单未生成`);
    const t = poi.options[0];
    app.poiStates[poi.id] = t;
    app.updateSeedFiltering();
    const n1 = app.availableSeeds.length;
    // 再点一个点位
    if (app.currentPOIs[1]) {
      const p2 = app.currentPOIs[1];
      const t2 = app.poiStates[p2.id] = p2.options[0];
      app.updateSeedFiltering();
      console.log(`    点位${poi.id}=${t} -> ${n1} 个；点位${p2.id}=${t2} -> ${app.availableSeeds.length} 个`);
    }
  }
  // 单种子图片路径检查
  app.chosenMap = 'Hollow'; app.chosenNightlord = 'Straghess';
  console.log('错误数:', errors.length, errors);
})().catch(e => { console.error('SMOKE FAIL:', e); process.exit(1); });



