'use strict';

const fs = require('fs');
const path = require('path');

const COBOL_VERBS = new Set([
  'ACCEPT', 'ADD', 'ALTER', 'CALL', 'CANCEL', 'CLOSE', 'COMPUTE', 'CONTINUE',
  'DELETE', 'DISPLAY', 'DIVIDE', 'EVALUATE', 'EXEC', 'EXIT', 'GO', 'GOBACK',
  'IF', 'INITIALIZE', 'INSPECT', 'MERGE', 'MOVE', 'MULTIPLY', 'OPEN',
  'PERFORM', 'READ', 'RELEASE', 'RETURN', 'REWRITE', 'SEARCH', 'SET',
  'SORT', 'START', 'STOP', 'STRING', 'SUBTRACT', 'UNSTRING', 'WRITE'
]);

// Fixed-format COBOL: col 7 = indicator, col 8-11 = Area A, col 12-72 = Area B
// (0-indexed: idx 6 = indicator, idx 7 = start of Area A, idx 11 = start of Area B)
function buildStatementMap(source) {
  const lines = source.split('\n');
  const map = {};
  let inProcedure = false;
  let verbCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.length < 7) continue;

    const indicator = raw[6];
    if (indicator === '*' || indicator === '/' || indicator === '-') continue;

    const content = raw.substring(7);
    const trimmed = content.trimStart();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('PROCEDURE DIVISION')) {
      inProcedure = true;
      continue;
    }
    if (!inProcedure) continue;

    // Skip paragraph/section names: they start in Area A (raw[7] is not space)
    const startsInAreaA = content.length > 0 && content[0] !== ' ';
    if (startsInAreaA) continue;

    const tokens = upper.split(/\s+/);
    // Strip trailing period (COBOL sentence terminator attached to verb e.g. GOBACK.)
    const firstToken = tokens[0].replace(/\.$/, '');

    if (COBOL_VERBS.has(firstToken)) {
      verbCount++;
      map[verbCount] = {
        lineNum: i + 1,
        text: raw.trimEnd(),
        verb: firstToken
      };
    }
  }
  return map;
}

function getSourceContext(source, targetLine, contextLines = 5) {
  const lines = source.split('\n');
  const start = Math.max(0, targetLine - contextLines - 1);
  const end = Math.min(lines.length - 1, targetLine + contextLines - 1);
  return lines.slice(start, end + 1).map((text, idx) => ({
    lineNum: start + idx + 1,
    text: text.trimEnd(),
    isTarget: start + idx + 1 === targetLine
  }));
}

const sourceCache = {};

function loadSource(programName) {
  if (sourceCache[programName]) return sourceCache[programName];
  const cobolDir = path.join(__dirname, '../../cobol');
  const filePath = path.join(cobolDir, programName + '.cbl');
  if (!fs.existsSync(filePath)) return null;
  const src = fs.readFileSync(filePath, 'utf8');
  sourceCache[programName] = src;
  return src;
}

function getStatementInfo(programName, stmtNumber) {
  const source = loadSource(programName);
  if (!source) return null;

  const map = buildStatementMap(source);
  const entry = map[stmtNumber];
  if (!entry) return null;

  const context = getSourceContext(source, entry.lineNum);
  return { lineNum: entry.lineNum, verb: entry.verb, text: entry.text, context };
}

function getAllStatements(programName) {
  const source = loadSource(programName);
  if (!source) return {};
  return buildStatementMap(source);
}

module.exports = { getStatementInfo, getAllStatements, getSourceContext, loadSource };
