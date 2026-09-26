#!/usr/bin/env node
/**
 * pdf-text.mjs  –  zero-dependency PDF content-stream text extractor
 *
 * Supported filters : ASCII85Decode, FlateDecode (via node:zlib)
 * ZapfDingbats glyph map covers the characters most likely to appear in
 * checked/unchecked checklist items (✔ ✘ ■ ❏).
 *
 * Usage:  node .bob/skills/plumbline/pdf-text.mjs <file.pdf>
 *
 * Output: one line per Tj / TJ operator text fragment, in stream order.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// ZapfDingbats code point → Unicode (subset covering common checklist glyphs)
// ---------------------------------------------------------------------------
const ZAPF = new Map([
  [0x34, '✦'], [0x35, '✧'], [0x36, '✩'], [0x37, '✪'], [0x38, '✫'],
  [0x4e, '■'],  // n  BLACK SQUARE
  [0x6f, '❏'],  // o  LOWER RIGHT DROP-SHADOWED WHITE SQUARE
  [0x53, '✓'],  // check mark
  [0x54, '✔'],  // 4  HEAVY CHECK MARK
  [0x55, '✕'],  // 5  MULTIPLICATION X
  [0x56, '✖'],  // 6  HEAVY MULTIPLICATION X
  [0x57, '✗'],  // 7  BALLOT X
  [0x58, '✘'],  // 8  HEAVY BALLOT X
  [0x6c, '●'],  // l  BLACK CIRCLE
  [0x6d, '❍'],  // m  DOTTED CIRCLE
  [0x6e, '■'],  // n  BLACK SQUARE (duplicate for safety)
]);

function zapfChar(code) {
  if (ZAPF.has(code)) return ZAPF.get(code);
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  return '';
}

// ---------------------------------------------------------------------------
// ASCII85Decode
// ---------------------------------------------------------------------------
function decodeAscii85(raw) {
  const out = [];
  let acc = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    if (ch === '~') break;
    if (ch === 'z') { out.push(0, 0, 0, 0); continue; }
    acc += ch;
    if (acc.length === 5) {
      let v = 0;
      for (const c of acc) v = v * 85 + (c.charCodeAt(0) - 33);
      out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
      acc = '';
    }
  }
  if (acc.length > 1) {
    const pad = acc.padEnd(5, 'u');
    let v = 0;
    for (const c of pad) v = v * 85 + (c.charCodeAt(0) - 33);
    const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    out.push(...bytes.slice(0, acc.length - 1));
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// Decode a single filter
// ---------------------------------------------------------------------------
function applyFilter(data, filter) {
  switch (filter) {
    case 'FlateDecode': case 'Fl':   return inflateSync(data);
    case 'ASCII85Decode': case 'A85': return decodeAscii85(data.toString('binary'));
    default: return data;
  }
}

// ---------------------------------------------------------------------------
// Scan raw PDF bytes for all stream objects and their filter lists
// ---------------------------------------------------------------------------
function extractStreams(pdfBuf) {
  const results = [];
  const raw = pdfBuf;
  let pos = 0;

  while (pos < raw.length) {
    // Find "stream" keyword
    const idx = raw.indexOf(Buffer.from('stream'), pos);
    if (idx === -1) break;

    // The byte immediately after "stream" must be \r\n or \n
    let dataStart = idx + 6;
    if (raw[dataStart] === 0x0d && raw[dataStart + 1] === 0x0a) dataStart += 2;
    else if (raw[dataStart] === 0x0a) dataStart += 1;
    else { pos = idx + 6; continue; }

    // Scan backwards from idx for "<<"
    let dictEnd = idx;
    while (dictEnd > 0 && raw[dictEnd] !== 0x3c) dictEnd--;
    if (dictEnd <= 0) { pos = dataStart; continue; }

    // Extract the dict text in raw ASCII
    const dictSlice = raw.slice(Math.max(0, dictEnd - 2048), idx).toString('latin1');

    // Parse /Length
    const lenM = dictSlice.match(/\/Length\s+(\d+)/);
    if (!lenM) { pos = dataStart; continue; }
    const length = parseInt(lenM[1], 10);

    // Parse /Filter
    let filters = [];
    const filterM = dictSlice.match(/\/Filter\s*(\[([^\]]*)\]|(\S+))/);
    if (filterM) {
      const body = filterM[2] !== undefined ? filterM[2] : filterM[3];
      filters = body.replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);
    }

    const streamData = raw.slice(dataStart, dataStart + length);
    results.push({ filters, data: streamData });
    pos = dataStart + length;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Simple hand-written parser for PDF string literals
// Returns the content between matching ( ) respecting backslash escapes
// Also handles nested parens.
// ---------------------------------------------------------------------------
function parsePdfString(src, start) {
  // start points to '(' – advance past it
  let i = start + 1;
  let depth = 1;
  let out = '';
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      const esc = src[i];
      if (esc >= '0' && esc <= '7') {
        let oct = esc;
        if (src[i + 1] >= '0' && src[i + 1] <= '7') { oct += src[i + 1]; i++; }
        if (src[i + 1] >= '0' && src[i + 1] <= '7') { oct += src[i + 1]; i++; }
        out += String.fromCharCode(parseInt(oct, 8));
      } else {
        const MAP = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        out += MAP[esc] ?? esc;
      }
    } else if (ch === '(') { depth++; out += ch; }
    else if (ch === ')') { depth--; if (depth > 0) out += ch; }
    else out += ch;
    i++;
  }
  return { str: out, end: i }; // i points past ')'
}

// ---------------------------------------------------------------------------
// Extract text lines from a decoded content stream
// ---------------------------------------------------------------------------
function parseContentStream(buf, zapfNames = new Set()) {
  const src = buf.toString('binary');
  const lines = [];
  let currentLine = '';
  let inZapf = false;

  // We tokenise the stream character by character
  let i = 0;
  while (i < src.length) {
    // Skip whitespace
    if (src[i] === ' ' || src[i] === '\t' || src[i] === '\r' || src[i] === '\n') { i++; continue; }

    // Comment
    if (src[i] === '%') { while (i < src.length && src[i] !== '\n') i++; continue; }

    // Font change operator sequence:  /FontName size Tf
    if (src[i] === '/') {
      let j = i + 1;
      while (j < src.length && src[j] !== ' ' && src[j] !== '\t' && src[j] !== '\r' && src[j] !== '\n') j++;
      const name = src.slice(i + 1, j);
      inZapf = zapfNames.has(name) || name.toLowerCase().includes('zapf');
      i = j;
      continue;
    }

    // String literal
    if (src[i] === '(') {
      const { str, end } = parsePdfString(src, i);
      i = end;
      // Next non-whitespace should be operator
      while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
      // Read operator
      let op = '';
      while (i < src.length && src[i] !== ' ' && src[i] !== '\t' && src[i] !== '\r' && src[i] !== '\n') {
        op += src[i++];
      }
      if (op === 'Tj' || op === "'") {
        const out = inZapf
          ? [...str].map(c => zapfChar(c.charCodeAt(0))).join('')
          : str;
        if (out.trim()) currentLine += out;
        if (op === "'") { // ' also moves to next line
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }
      }
      continue;
    }

    // TJ array: [ ... ]
    if (src[i] === '[') {
      i++;
      let chunk = '';
      while (i < src.length && src[i] !== ']') {
        if (src[i] === '(') {
          const { str, end } = parsePdfString(src, i);
          const out = inZapf
            ? [...str].map(c => zapfChar(c.charCodeAt(0))).join('')
            : str;
          chunk += out;
          i = end;
        } else {
          i++; // skip numbers, spaces
        }
      }
      i++; // skip ']'
      // Skip whitespace then read operator
      while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
      let op = '';
      while (i < src.length && src[i] !== ' ' && src[i] !== '\t' && src[i] !== '\r' && src[i] !== '\n') {
        op += src[i++];
      }
      if (op === 'TJ') {
        if (chunk.trim()) currentLine += chunk;
      }
      continue;
    }

    // Text positioning operators that signal a new line
    // Td, TD, T*, Tm – flush current line
    if (src[i] === 'T') {
      const op2 = src[i + 1];
      if (op2 === 'd' || op2 === 'D' || op2 === '*' || op2 === 'm') {
        if (currentLine.trim()) { lines.push(currentLine.trim()); currentLine = ''; }
        i += 2; continue;
      }
    }

    // BT / ET
    if (src.slice(i, i + 2) === 'BT' || src.slice(i, i + 2) === 'ET') {
      if (currentLine.trim()) { lines.push(currentLine.trim()); currentLine = ''; }
      i += 2; continue;
    }

    i++;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node pdf-text.mjs <file.pdf>'); process.exit(1); }

const pdfBuf = readFileSync(filePath);
const streams = extractStreams(pdfBuf);

// Review correction: content streams select fonts by resource name (/F3), not
// by font name, so a check on the name alone never saw ZapfDingbats. Resolve
// each resource name to its font object's /BaseFont first.
const pdfText = pdfBuf.toString('latin1');
const baseByObj = new Map();
for (const m of pdfText.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
  const b = /\/BaseFont\s*\/([^\s/<>\[\]()]+)/.exec(m[2]);
  if (!b) continue;
  baseByObj.set(m[1], b[1]);
  const n = /\/Name\s*\/([^\s/<>\[\]()]+)/.exec(m[2]);
  if (n && /zapf|dingbat/i.test(b[1])) baseByObj.set('name:' + n[1], b[1]);
}
const zapfNames = new Set();
for (const m of pdfText.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
  if (/zapf|dingbat/i.test(baseByObj.get(m[2]) ?? '')) zapfNames.add(m[1]);
}
for (const k of baseByObj.keys()) if (k.startsWith('name:')) zapfNames.add(k.slice(5));

const allLines = [];
for (const { filters, data } of streams) {
  try {
    let buf = data;
    for (const f of filters) buf = applyFilter(buf, f);
    const ls = parseContentStream(buf, zapfNames);
    allLines.push(...ls);
  } catch { /* skip undecoded streams */ }
}

const deduped = allLines.filter((l, i) => l !== allLines[i - 1]);
for (const line of deduped) console.log(line);
