import { isKnownIcon } from './icons.js';

// Section 4.3: heuristic rules, implemented with regular expressions, that detect
// and repair malformed React. They run on model output, on pasted and uploaded code,
// and on Fix Render. Returns the code unchanged when nothing applies.
//
// Remix base: the rules are ported from group 1's xhigh revibe, which handled more
// cases than the original ones (several components, JSON-escaped code, HTML comments,
// multi-line imports, icon aliases such as FaHeart). One rule is new: an unknown
// component that wraps content becomes a <div>, so its text is not lost.

const STOCK = {
  landscape: [0, 1, 2, 3].map((i) => `/stock/landscape${i}.jpg`),
  portrait: [0, 1, 2, 3].map((i) => `/stock/portrait${i}.jpg`),
};

const BUILTIN = new Set(['React', 'Fragment']);
// 3D remix: the 3D helpers from lib/three3d.jsx are in scope too.
const THREE_HELPERS = new Set(['Scene3D', 'Spin', 'Float3D', 'RoundedBox']);
const known = (name) => BUILTIN.has(name) || THREE_HELPERS.has(name) || isKnownIcon(name);

// Apply fn to the token list of every static className string.
function mapClassNames(code, fn) {
  const rewrite = (cls) => fn(cls.split(/\s+/).filter(Boolean)).join(' ');
  return code
    .replace(/className=(["'])([^"'\n]*)\1/g, (m, q, cls) => `className=${q}${rewrite(cls)}${q}`)
    .replace(/className=\{`([^`$]*)`\}/g, (m, cls) => `className={\`${rewrite(cls)}\`}`);
}

// The UI renders in a phone-sized frame, so screen-sized classes mean the frame.
const SCREEN_CLASSES = {
  fixed: 'absolute', // the paper's prompt: "use absolute bottom-0 instead of fixed bottom-0"
  'h-screen': 'h-full',
  'min-h-screen': 'min-h-full',
  'max-h-screen': 'max-h-full',
  'w-screen': 'w-full',
};

// Images must come from /stock/: portraits for avatars, landscapes otherwise.
function fixImages(code) {
  let n = 0;
  // Look at the whole tag, since className often comes after src.
  return code.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']*)\2([^>]*>)/g, (m, head, q, url, tail) => {
    const s = url.match(/stock\/(landscape|portrait)(\d+)\.jpg$/);
    if (s) return `${head}${q}/stock/${s[1]}${Number(s[2]) % 4}.jpg${q}${tail}`;
    const kind = /rounded-full|avatar|profile/i.test(m) ? 'portrait' : 'landscape';
    return `${head}${q}${STOCK[kind][n++ % 4]}${q}${tail}`;
  });
}

// Components that are neither defined in the code nor in scope would throw at render.
// Icon-like names (FaHeart, HeartIcon, LucideHome) become the matching lucide icon. Other
// names become a <div> when they wrap content, so their text survives, or a Circle icon
// when they are self-closing.
function fixUnknownComponents(code) {
  const defined = new Set();
  for (const m of code.matchAll(/(?:const|let|var|function|class)\s+([A-Z][\w$]*)/g)) defined.add(m[1]);
  const used = new Set();
  for (const m of code.matchAll(/<\/?([A-Z][\w$]*)[\s/>]/g)) used.add(m[1]);
  for (const m of code.matchAll(/(?:icon|Icon)\s*[:=]\s*\{?\s*([A-Z][\w$]*)/g)) used.add(m[1]);
  for (const name of used) {
    if (defined.has(name) || known(name)) continue;
    const base = name
      .replace(/^Lucide/, '')
      .replace(/Icon$/, '')
      .replace(/^(Fa|Fi|Md|Hi|Io|Ai|Bi|Bs|Ri|Tb|Lu)(Outline|Solid)?/, '')
      .replace(/(Outline|Solid|Fill)$/, '');
    const alias = { Home: 'House', Edit3: 'Pencil', Trash: 'Trash2', Share: 'Share2', Close: 'X', Times: 'X' }[base] || base;
    const wrapsContent = new RegExp(`</${name}\\s*>`).test(code);
    let to;
    if (alias !== name && known(alias)) to = alias;
    else if (wrapsContent) to = 'div';
    else to = known(alias) ? alias : 'Circle';
    code = code.replace(new RegExp(`(<\\/?|[:=]\\s*\\{?\\s*)${name}\\b`, 'g'), `$1${to}`);
  }
  return code;
}

// 3D remix: models often write @react-three/fiber or drei names that are not in
// scope. Map them onto the 3D helpers, or drop helpers that only add polish, before
// the unknown-component rule would turn them into icons (which crash a 3D scene).
const DREI_DROPPED = 'OrbitControls|Environment|ContactShadows|PerspectiveCamera|OrthographicCamera|Stars|SoftShadows|BakeShadows|AccumulativeShadows|Preload|AdaptiveDpr|Sky';
const DREI_GROUPS = 'Center|Stage|Bounds|PresentationControls|Resize';
function fix3D(code) {
  if (!/<(Scene3D|Canvas)\b|<mesh\b/.test(code)) return code;
  return code
    .replace(/<(\/?)Canvas\b/g, '<$1Scene3D')
    .replace(/<(\/?)Float\b(?!3D)/g, '<$1Float3D')
    .replace(new RegExp(`<(?:${DREI_DROPPED})\\b[^<>]*?\\/>`, 'g'), '')
    .replace(new RegExp(`<(\\/?)(?:${DREI_GROUPS})\\b[^<>]*?>`, 'g'), '<$1group>');
}

// react-live renders one expression; turn declarations into one.
function toExpression(code) {
  code = code.trim().replace(/;+\s*$/, '');
  if (/^(\(\s*\)|\(\s*\{?[^)]*\}?\s*\)|[a-z_$][\w$]*)\s*=>/.test(code) || /^function\s*\(/.test(code) || /^</.test(code)) {
    return code;
  }
  // helper declarations followed by the anonymous main component
  const anon = [...code.matchAll(/^\(\s*\)\s*=>/gm)].pop();
  if (anon && anon.index > 0) {
    return `(() => {\n${code.slice(0, anon.index)}\nreturn (${code.slice(anon.index).replace(/;+\s*$/, '')});\n})()`;
  }
  const names = [...code.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Z][\w$]*)\s*=|(?:^|\n)\s*function\s+([A-Z][\w$]*)\s*\(/g)].map(
    (m) => m[1] || m[2]
  );
  const main = names.includes('App') ? 'App' : names.pop();
  if (main) return `(() => {\n${code}\nreturn ${main};\n})()`;
  return code;
}

export function repairCode(input) {
  let code = String(input ?? '').trim();
  const fence = code.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  if (fence) code = fence[1].trim();
  if (/^`[\s\S]*`$/.test(code)) code = code.slice(1, -1).trim();
  // a JSON-escaped string slipped through
  if (/^"[\s\S]*"$/.test(code)) {
    try {
      code = JSON.parse(code);
    } catch {
      /* keep as is */
    }
  }
  const exported = code.match(/export\s+default\s+(?:function\s+)?([A-Z][\w$]*)/);
  code = code
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, '')
    .replace(/^(\s*)export\s+(default\s+)?/gm, '$1')
    .replace(/^\s*render\s*\(\s*<[\s\S]*?\/>\s*\)\s*;?\s*$/gm, '')
    .replace(/^\s*ReactDOM\.[\s\S]*?;\s*$/gm, '')
    .replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}')
    .replace(/(<[a-zA-Z][^<>]*?\s)class=(["'{])/g, '$1className=$2')
    .replace(/(<label\b[^<>]*?\s)for=/g, '$1htmlFor=')
    .replace(/\sstyle="[^"]*"/g, '');
  code = code.trim().replace(/;+\s*$/, '');
  code =
    exported && !/^\(\s*\)\s*=>/.test(code) ? `(() => {\n${code}\nreturn ${exported[1]};\n})()` : toExpression(code);
  code = mapClassNames(code, (tokens) => tokens.map((t) => SCREEN_CLASSES[t] || t));
  code = fixImages(code);
  code = fix3D(code);
  code = fixUnknownComponents(code);
  return code.trim();
}
