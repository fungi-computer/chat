/**
 * Vanilla Milkshake Prism Theme
 *
 * A light, pastel syntax highlighting theme based on the Vanilla Milkshake
 * pixel art palette (https://lospec.com/palette-list/vanilla-milkshake).
 *
 * Designed for readability on light backgrounds (#f0f6f0 / #fff7e4).
 */

const vanillaMilkshake = {
  ':not(pre) > code[class*="language-"]': {
    background: "#fff7e4",
    borderRadius: "0",
    padding: ".2em .4em",
  },
  atrule: {
    color: "#b0a9e4",
  },
  "attr-name": {
    color: "#b0a9e4",
  },
  "attr-value": {
    color: "#f98284",
  },
  bold: {
    fontWeight: "bold",
  },
  boolean: {
    color: "#feaae4",
  },
  cdata: {
    color: "#6c5671",
    fontStyle: "italic",
  },
  'code[class*="language-"]': {
    background: "none",
    color: "#28282e",
    direction: "ltr",
    fontFamily:
      '"PixelCode", "Consolas", "Bitstream Vera Sans Mono", "Courier New", Courier, monospace',
    fontSize: "1em",
    hyphens: "none",
    lineHeight: "1.5",
    MozHyphens: "none",
    MozTabSize: "4",
    msHyphens: "none",
    OTabSize: "4",
    tabSize: "4",
    textAlign: "left",
    WebkitHyphens: "none",
    whiteSpace: "pre",
    wordBreak: "normal",
    wordSpacing: "normal",
  },
  'code[class*="language-"]::-moz-selection': {
    background: "#ffe6c6",
  },
  'code[class*="language-"] ::-moz-selection': {
    background: "#ffe6c6",
  },
  'code[class*="language-"]::selection': {
    background: "#ffe6c6",
  },
  'code[class*="language-"] ::selection': {
    background: "#ffe6c6",
  },
  comment: {
    color: "#6c5671",
    fontStyle: "italic",
  },
  constant: {
    color: "#feaae4",
  },
  deleted: {
    color: "#ffc384",
  },
  doctype: {
    color: "#6c5671",
    fontStyle: "italic",
  },
  entity: {
    color: "#87a889",
  },
  function: {
    color: "#ffc384",
  },
  important: {
    fontWeight: "bold",
  },
  inserted: {
    color: "#87a889",
  },
  italic: {
    fontStyle: "italic",
  },
  keyword: {
    color: "#b0a9e4",
  },
  "language-autohotkey .token.keyword": {
    color: "#accce4",
  },
  "language-autohotkey .token.selector": {
    color: "#b0a9e4",
  },
  "language-autohotkey .token.tag": {
    color: "#ffc384",
  },
  namespace: {
    opacity: ".7",
  },
  number: {
    color: "#feaae4",
  },
  operator: {
    color: "#28282e",
  },
  'pre[class*="language-"]': {
    backgroundColor: "transparent",
    color: "#28282e",
    direction: "ltr",
    fontFamily:
      '"PixelCode", "Consolas", "Bitstream Vera Sans Mono", "Courier New", Courier, monospace',
    fontSize: "1em",
    hyphens: "none",
    lineHeight: "1.5",
    margin: "0",
    MozHyphens: "none",
    MozTabSize: "4",
    msHyphens: "none",
    OTabSize: "4",
    overflow: "auto",
    padding: "1em",
    tabSize: "4",
    textAlign: "left",
    WebkitHyphens: "none",
    whiteSpace: "pre",
    wordBreak: "normal",
    wordSpacing: "normal",
  },
  'pre[class*="language-"]::-moz-selection': {
    background: "#ffe6c6",
  },
  'pre[class*="language-"] ::-moz-selection': {
    background: "#ffe6c6",
  },
  'pre[class*="language-"]::selection': {
    background: "#ffe6c6",
  },
  'pre[class*="language-"] ::selection': {
    background: "#ffe6c6",
  },
  'pre > code[class*="language-"]': {
    fontSize: "1em",
  },
  prolog: {
    color: "#6c5671",
    fontStyle: "italic",
  },
  property: {
    color: "#87a889",
  },
  punctuation: {
    color: "#28282e",
  },
  regex: {
    color: "#f98284",
  },
  selector: {
    color: "#accce4",
  },
  string: {
    color: "#f98284",
  },
  symbol: {
    color: "#feaae4",
  },
  tag: {
    color: "#accce4",
  },
  url: {
    color: "#87a889",
  },
  variable: {
    color: "#87a889",
  },
};

export { vanillaMilkshake };
