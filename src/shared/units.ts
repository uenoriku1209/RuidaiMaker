// 単位 (siunitx 風の命令) と Ω などの記号への対応。
// 画面の数式表示 (KaTeX)・図の描画 (TikZ)・.tex 出力で同じ書き方が使えるようにする。

/** siunitx の単位命令 → 記号 */
const UNITS: Record<string, string> = {
  // 接頭語
  yocto: 'y',
  zepto: 'z',
  atto: 'a',
  femto: 'f',
  pico: 'p',
  nano: 'n',
  micro: '\\mu ',
  milli: 'm',
  centi: 'c',
  deci: 'd',
  deca: 'da',
  hecto: 'h',
  kilo: 'k',
  mega: 'M',
  giga: 'G',
  tera: 'T',
  peta: 'P',
  // 単位
  meter: 'm',
  metre: 'm',
  gram: 'g',
  kilogram: 'kg',
  second: 's',
  ampere: 'A',
  kelvin: 'K',
  mole: 'mol',
  candela: 'cd',
  hertz: 'Hz',
  newton: 'N',
  pascal: 'Pa',
  joule: 'J',
  watt: 'W',
  coulomb: 'C',
  volt: 'V',
  farad: 'F',
  ohm: '\\Omega',
  siemens: 'S',
  weber: 'Wb',
  tesla: 'T',
  henry: 'H',
  lumen: 'lm',
  lux: 'lx',
  becquerel: 'Bq',
  gray: 'Gy',
  sievert: 'Sv',
  liter: 'L',
  litre: 'L',
  electronvolt: 'eV',
  minute: 'min',
  hour: 'h',
  radian: 'rad',
  steradian: 'sr',
  bel: 'B',
  decibel: 'dB',
  angstrom: '\\mathring{A}',
  atomicmassunit: 'u',
  dalton: 'Da',
  astronomicalunit: 'au',
  hectare: 'ha',
  tonne: 't',
  degreeCelsius: '{}^{\\circ}\\mathrm{C}',
  celsius: '{}^{\\circ}\\mathrm{C}',
  degree: '{}^{\\circ}',
  arcminute: "'",
  arcsecond: "''",
  percent: '\\%',
  VA: 'VA',
  kWh: 'kWh',
  mAh: 'mAh',
  // べき・区切り
  per: '/',
  squared: '^{2}',
  cubed: '^{3}'
}

/** KaTeX 用のマクロ (画面表示・チャット) */
export const KATEX_UNIT_MACROS: Record<string, string> = {
  '\\SI': '#1\\,\\mathrm{#2}',
  '\\qty': '#1\\,\\mathrm{#2}',
  '\\si': '\\mathrm{#1}',
  '\\unit': '\\mathrm{#1}',
  '\\num': '#1',
  '\\ang': '#1^{\\circ}',
  '\\SIrange': '#1\\,\\mathrm{#3}\\text{〜}#2\\,\\mathrm{#3}',
  '\\qtyrange': '#1\\,\\mathrm{#3}\\text{〜}#2\\,\\mathrm{#3}',
  '\\tothe': '^{#1}',
  ...Object.fromEntries(Object.entries(UNITS).map(([k, v]) => [`\\${k}`, v]))
}

/**
 * LaTeX (TikZ の図・.tex 出力) 用の定義。
 * \providecommand なので、siunitx を読み込んでいる場合はそちらが優先される。
 * \ensuremath により、数式の外 (circuitikz のラベルなど) でも使える。
 */
export const TEX_UNIT_PREAMBLE = [
  '\\providecommand{\\SI}[2]{\\ensuremath{#1\\,\\mathrm{#2}}}',
  '\\providecommand{\\qty}[2]{\\ensuremath{#1\\,\\mathrm{#2}}}',
  '\\providecommand{\\si}[1]{\\ensuremath{\\mathrm{#1}}}',
  '\\providecommand{\\unit}[1]{\\ensuremath{\\mathrm{#1}}}',
  '\\providecommand{\\num}[1]{\\ensuremath{#1}}',
  '\\providecommand{\\ang}[1]{\\ensuremath{#1^{\\circ}}}',
  ...Object.entries(UNITS).map(
    ([k, v]) =>
      `\\providecommand{\\${k}}{\\ensuremath{${/^[A-Za-z]+$/.test(v) ? `\\mathrm{${v}}` : v}}}`
  )
].join('\n')

/** 図のコードに含まれる Unicode の記号を TeX の命令に置き換える (TikZ は Ω などを直接扱えない) */
export function unicodeSymbolsToTex(code: string): string {
  return code
    .replace(/℃/g, '\\ensuremath{{}^{\\circ}\\mathrm{C}}')
    .replace(/Ω|Ω/g, '\\ensuremath{\\Omega}')
    .replace(/[μµ]/g, '\\ensuremath{\\mu}')
    .replace(/°/g, '\\ensuremath{{}^{\\circ}}')
    .replace(/×/g, '\\ensuremath{\\times}')
    .replace(/±/g, '\\ensuremath{\\pm}')
    .replace(/−/g, '-')
    .replace(/π/g, '\\ensuremath{\\pi}')
    .replace(/θ/g, '\\ensuremath{\\theta}')
    .replace(/[α]/g, '\\ensuremath{\\alpha}')
    .replace(/β/g, '\\ensuremath{\\beta}')
    .replace(/ω/g, '\\ensuremath{\\omega}')
    .replace(/Δ/g, '\\ensuremath{\\Delta}')
}
