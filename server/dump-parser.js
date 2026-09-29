'use strict';

// Parses both CEEDUMP and SYSDUMP text into structured JSON
function parse(raw) {
  const lines = raw.split('\n');
  const type = detectType(lines);

  if (type === 'CEEDUMP') return parseCEEDUMP(lines);
  if (type === 'SYSDUMP') return parseSYSDUMP(lines);

  return { type: 'UNKNOWN', raw, summary: { abendCode: 'UNKNOWN', programName: 'UNKNOWN' } };
}

function detectType(lines) {
  for (const l of lines.slice(0, 20)) {
    if (l.startsWith('CEE3DMP')) return 'CEEDUMP';
    if (l.includes('IEA995I') || l.includes('IEA992I')) return 'SYSDUMP';
    if (l.match(/COMPLETION CODE\s+SYSTEM\s*=/)) return 'SYSDUMP';
    if (l.match(/PSW AT ENTRY TO ABEND/)) return 'SYSDUMP';
    if (l.match(/^1JOB\s+\w/)) return 'SYSDUMP';
  }
  return 'UNKNOWN';
}

// ─── CEEDUMP parser ────────────────────────────────────────────────────────
function parseCEEDUMP(lines) {
  const result = {
    type: 'CEEDUMP',
    header: {},
    conditions: [],
    location: {},
    traceback: [],
    workingStorage: [],
    linkage: [],
    raw: lines.join('\n')
  };

  // Header: CEE3DMP V2 R1.0:  31 bit  COBOL  28 Sep 2026 13:27:42
  const headerLine = lines[0] || '';
  const headerMatch = headerLine.match(/CEE3DMP\s+(\S+)\s+.*?(\d{2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}:\d{2})/);
  if (headerMatch) {
    result.header.version = headerMatch[1];
    result.header.timestamp = headerMatch[2];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Condition token
    if (line.match(/^\s+Token:/)) {
      const m = line.match(/Token:\s+(.+)/);
      if (m && result.conditions.length === 0) result.conditions.push({ token: m[1].trim() });
    }

    // ISI message line
    if (line.match(/^\s+CEE\d+[A-Z]/)) {
      const cond = result.conditions[result.conditions.length - 1] || {};
      cond.message = line.trim();
      if (!result.conditions.includes(cond)) result.conditions.push(cond);
    }

    // Location
    if (line.match(/^\s+Program Unit:\s+/)) {
      result.location.programName = line.replace(/^\s+Program Unit:\s+/, '').trim();
    }
    if (line.match(/^\s+PU Type:\s+/)) {
      result.location.puType = line.replace(/^\s+PU Type:\s+/, '').trim();
    }
    if (line.match(/^\s+PU Address:\s+/)) {
      result.location.puAddress = line.replace(/^\s+PU Address:\s+/, '').trim();
    }
    if (line.match(/^\s+Statement:\s+/)) {
      const m = line.match(/Statement:\s+(\d+)/);
      if (m) result.location.statement = parseInt(m[1]);
    }
    if (line.match(/^\s+Offset:\s+/)) {
      const m = line.match(/Offset:\s+(X'\S+')/);
      if (m) result.location.offset = m[1];
    }
    if (line.match(/^\s+DSA Address:\s+/)) {
      result.location.dsaAddress = line.replace(/^\s+DSA Address:\s+/, '').trim();
    }

    // Traceback lines: 4 hex chars then program name
    if (line.match(/^\s+[0-9A-F]{8}\s+\S/)) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 5) {
        result.traceback.push({
          dsaAddr: parts[0],
          programUnit: parts[1].trim(),
          puType: parts[2].trim(),
          puAddr: parts[3].trim(),
          statement: parts[4].trim() === '--' ? null : parseInt(parts[4]),
          offset: parts[5] ? parts[5].trim() : ''
        });
      }
    }

    // Working storage fields
    const wsMatch = line.match(/^\s+(01\s+\S+\s+PIC\s+\S+)/);
    if (wsMatch) {
      const entry = { definition: wsMatch[1].trim() };
      if (lines[i + 1]) {
        const valMatch = lines[i + 1].match(/Value:\s+(.+)/);
        if (valMatch) entry.value = valMatch[1].trim();
      }
      if (lines[i + 2]) {
        const hexMatch = lines[i + 2].match(/Hex:\s+(\S+)/);
        if (hexMatch) entry.hex = hexMatch[1];
      }
      result.workingStorage.push(entry);
    }

    // Linkage fields (LK-xxx = 'value')
    const lkMatch = line.match(/^\s+(LK-\w+)\s+=\s+(.+)/);
    if (lkMatch) {
      result.linkage.push({ field: lkMatch[1], value: lkMatch[2].trim() });
    }

    i++;
  }

  // Build summary
  result.summary = {
    abendCode: deduceAbendFromCEE(result),
    programName: result.location.programName || 'UNKNOWN',
    statement: result.location.statement,
    offset: result.location.offset,
    timestamp: result.header.timestamp,
    dumpType: 'CEEDUMP',
    message: (result.conditions[0] && result.conditions[0].message) || '',
    callDepth: result.traceback.length
  };

  return result;
}

function deduceAbendFromCEE(r) {
  const msg = (r.conditions[0] && r.conditions[0].message) || '';
  if (msg.includes('0C7') || msg.includes('data exception')) return 'S0C7';
  if (msg.includes('0CB') || msg.includes('zero')) return 'S0CB';
  return 'S0Cx';
}

// ─── SYSDUMP parser ─────────────────────────────────────────────────────────
function parseSYSDUMP(lines) {
  const result = {
    type: 'SYSDUMP',
    header: {},
    psw: {},
    activeModule: {},
    registers: {},
    storageRows: [],
    ceeDiag: null,
    raw: lines.join('\n')
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Internal format: JOB WMAPYMNT STEP PAYPOST  ABEND S0C4
    const jobMatch = line.match(/JOB\s+(\S+)\s+STEP\s+(\S+)\s+ABEND\s+(\S+)/);
    if (jobMatch) {
      result.header.jobName  = jobMatch[1];
      result.header.stepName = jobMatch[2];
      result.header.abendCode = jobMatch[3];
    }

    // ── External format: 1JOB CLMD453    STEP STEP080    TIME 005320
    if (!result.header.jobName) {
      const jobMatch2 = line.match(/^1?JOB\s+(\S+)\s+STEP\s+(\S+)/);
      if (jobMatch2) {
        result.header.jobName  = jobMatch2[1];
        result.header.stepName = jobMatch2[2];
        const timeM = line.match(/TIME\s+(\d{6})/);
        if (timeM) {
          const t = timeM[1];
          result.header.time = `${t.slice(0,2)}.${t.slice(2,4)}.${t.slice(4,6)}`;
        }
      }
    }

    // ── Internal: SYSTEM COMPLETION CODE=S0C4  REASON CODE=00000001
    const ccMatch = line.match(/SYSTEM COMPLETION CODE=(\S+)\s+REASON CODE=(\S+)/);
    if (ccMatch) {
      result.header.completionCode = ccMatch[1];
      result.header.reasonCode     = ccMatch[2];
    }

    // ── External: COMPLETION CODE   SYSTEM = 0C7  REASON CODE = 00000007
    if (!result.header.completionCode) {
      const ccMatch2 = line.match(/COMPLETION CODE\s+SYSTEM\s*=\s*([0-9A-Fa-f]+)(?:\s+REASON CODE\s*=\s*(\S+))?/);
      if (ccMatch2) {
        result.header.completionCode = 'S' + ccMatch2[1].toUpperCase();
        if (ccMatch2[2]) result.header.reasonCode = ccMatch2[2];
      }
    }

    // ── Internal: TIME=13.27.42  SEQ=02456  CPU=0000  ASID=0023
    const timeMatch = line.match(/TIME=(\d{2}\.\d{2}\.\d{2})\s+SEQ=(\S+)\s+CPU=(\S+)\s+ASID=(\S+)/);
    if (timeMatch) {
      result.header.time  = timeMatch[1];
      result.header.seq   = timeMatch[2];
      result.header.cpu   = timeMatch[3];
      result.header.asid  = timeMatch[4];
    }

    // ── Internal PSW: PSW AT TIME OF ERROR ... INTCODE=0007
    const pswMatch = line.match(/PSW AT TIME OF ERROR\s+(\S+)\s+(\S+)\s+ILC\s+(\d+)\s+INTCODE=(\S+)/);
    if (pswMatch) {
      result.psw = { word1: pswMatch[1], word2: pswMatch[2],
                     ilc: parseInt(pswMatch[3]), intcode: pswMatch[4] };
    }

    // ── External PSW: PSW AT ENTRY TO ABEND   078D1000 AE4CAC86  ILC 06  INTC 0007
    if (!result.psw.word1) {
      const pswMatch2 = line.match(/PSW AT ENTRY TO ABEND\s+(\S+)\s+(\S+)\s+ILC\s+(\d+)\s+INTC\s*(\S+)/i);
      if (pswMatch2) {
        result.psw = { word1: pswMatch2[1], word2: pswMatch2[2],
                       ilc: parseInt(pswMatch2[3]), intcode: pswMatch2[4] };
      }
    }

    // DATA AT PSW — internal: "- D206D050D0B0 XX YY" / external: "-  FA32D0A8 D0B00A08  44DDF43F"
    const dataPswMatch = line.match(/DATA AT PSW\s+\S+\s+-\s+([\s0-9A-Fa-f]+)/i);
    if (dataPswMatch && !result.instrBytes) {
      const hexOnly = dataPswMatch[1].replace(/\s+/g, '').toUpperCase();
      if (hexOnly.length >= 8) result.instrBytes = hexOnly.substring(0, 12);
    }

    // ── Internal module: ACTIVE LOAD MODULE  ADDRESS=1F400000  OFFSET=000014BC
    const modMatch = line.match(/ACTIVE LOAD MODULE\s+ADDRESS=(\S+)\s+OFFSET=(\S+)/);
    if (modMatch) {
      result.activeModule.address = modMatch[1];
      result.activeModule.offset  = modMatch[2];
    }

    // ── External module: PSW LOAD MODULE             ADDRESS = 2E4CAC86  OFFSET = 00002C86
    if (!result.activeModule.address) {
      const modMatch2 = line.match(/PSW LOAD MODULE\s+ADDRESS\s*=\s*(\S+)\s+OFFSET\s*=\s*(\S+)/i);
      if (modMatch2) {
        result.activeModule.address = modMatch2[1];
        result.activeModule.offset  = modMatch2[2];
      }
    }

    // NAME= (1 space internal, 3+ spaces external)
    const nameMatch = line.match(/^\s+NAME=(\S+)/);
    if (nameMatch && !result.activeModule.name) {
      result.activeModule.name = nameMatch[1];
    }

    // CSECT line
    const csectMatch = line.match(/CSECT:(\S+)\s+OFFSET X'([0-9A-F]+)'/);
    if (csectMatch) {
      result.activeModule.csect       = csectMatch[1];
      result.activeModule.csectOffset = csectMatch[2];
    }

    // Registers: GR 0: XXXXXXXX   GR 1: XXXXXXXX ...
    const grMatch = line.match(/GR[\s\d]+:\s+[0-9A-F]{8}/g);
    if (grMatch) {
      grMatch.forEach(g => {
        const m = g.match(/GR\s*(\d+):\s+([0-9A-F]{8})/);
        if (m) result.registers[`GR${m[1].padStart(2,'0')}`] = m[2];
      });
    }

    // Storage rows: 1F400000 - XXXXXXXX XXXXXXXX ...
    const storageMatch = line.match(/^\s*([0-9A-F]{8})\s+-\s+(.+)/);
    if (storageMatch) {
      result.storageRows.push({
        address: storageMatch[1],
        data: storageMatch[2].trim().split(/\s+/)
      });
    }

    // ── CEE3207S inline diagnostics (real SYSDUMPs include LE output)
    if (line.includes('CEE3207S')) {
      if (!result.ceeDiag) result.ceeDiag = {};
      result.ceeDiag.message = line.trim();
    }
    // "From compile unit PAYCALC at entry point PAYCALC at statement 510 at compile unit offset +00002C86"
    const fromMatch = line.match(/at statement\s+(\d+)\s+at compile unit offset\s+\+?([0-9A-Fa-f]+)/i);
    if (fromMatch && result.ceeDiag) {
      result.ceeDiag.statement = parseInt(fromMatch[1]);
      result.ceeDiag.offset    = fromMatch[2].toUpperCase();
    }
    // "Data field IN-POL-VALUE contains X'404040' which is not valid packed decimal"
    const dfMatch = line.match(/Data field\s+(\S+)\s+contains\s+(X'[^']+') which is not valid packed decimal/i);
    if (dfMatch && result.ceeDiag) {
      result.ceeDiag.badField = dfMatch[1];
      result.ceeDiag.badValue = dfMatch[2];
    }
  }

  result.summary = {
    abendCode:   result.header.completionCode || result.header.abendCode || 'UNKNOWN',
    programName: result.activeModule.name || 'UNKNOWN',
    statement:   (result.ceeDiag && result.ceeDiag.statement) || null,
    offset:      result.activeModule.offset || result.activeModule.csectOffset ||
                 (result.ceeDiag && result.ceeDiag.offset) || null,
    timestamp:   result.header.time,
    dumpType:    'SYSDUMP',
    jobName:     result.header.jobName,
    stepName:    result.header.stepName,
    message:     getAbendDescription(result.header.completionCode || result.header.abendCode)
  };

  return result;
}

function getAbendDescription(code) {
  const DESCS = {
    'S0C7': 'Data Exception - packed decimal field contains invalid (non-numeric) data',
    'S0C4': 'Protection Exception - program accessed storage outside its address space',
    'S0CB': 'Divide Exception - zero value was used as a divisor',
    'S322': 'CPU Time Limit Exceeded - job exceeded its CPU time allocation',
    'S806': 'Load Module Not Found - required program not found in any library'
  };
  return DESCS[code] || `System abend ${code}`;
}

module.exports = { parse };
