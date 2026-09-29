#!/usr/bin/env node
'use strict';
// Generates "How to use.pdf" for DumpAnalyzer using Playwright's PDF export.

const { chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const RAILWAY_URL = 'https://dumpanalyzer-production.up.railway.app';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; font-size: 12pt; line-height: 1.6; }

  .cover { page-break-after: always; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 40px; background: #0d1117; }
  .cover-logo { font-size: 44pt; font-weight: 800; color: #39d353; letter-spacing: 1px; margin-bottom: 10px; }
  .cover-sub  { font-size: 14pt; color: #8b949e; margin-bottom: 40px; }
  .cover-url  { font-family: 'JetBrains Mono', monospace; font-size: 13pt; color: #58a6ff; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 28px; display: inline-block; margin-bottom: 40px; }
  .cover-date { font-size: 10pt; color: #8b949e; }
  .cover-badge-row { display: flex; gap: 14px; justify-content: center; margin-top: 30px; flex-wrap: wrap; }
  .badge { font-size: 9pt; font-weight: 600; padding: 5px 14px; border-radius: 20px; border: 1px solid #30363d; background: #161b22; color: #8b949e; }

  .page { padding: 50px 55px; page-break-after: always; }
  h1 { font-size: 22pt; font-weight: 800; color: #39d353; margin-bottom: 6px; }
  h2 { font-size: 15pt; font-weight: 700; color: #58a6ff; margin-top: 30px; margin-bottom: 10px; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
  h3 { font-size: 12pt; font-weight: 700; color: #ffa657; margin-top: 18px; margin-bottom: 6px; }
  p  { margin-bottom: 10px; color: #c9d1d9; }

  .step-grid { display: grid; grid-template-columns: 36px 1fr; gap: 12px 14px; margin: 14px 0; }
  .step-num  { background: #ffa657; color: #000; font-weight: 700; font-size: 10pt; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .step-body { padding-top: 4px; }
  .step-title { font-weight: 700; color: #c9d1d9; }
  .step-desc  { font-size: 10pt; color: #8b949e; margin-top: 2px; }

  .feature-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .feature-table th { text-align: left; padding: 7px 12px; background: #161b22; color: #8b949e; font-size: 10pt; text-transform: uppercase; letter-spacing: .5px; border-bottom: 2px solid #30363d; }
  .feature-table td { padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 10pt; }
  .feature-table td:first-child { color: #39d353; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
  .feature-table td:last-child  { color: #c9d1d9; }

  .callout { background: #161b22; border: 1px solid #30363d; border-left: 4px solid #39d353; border-radius: 0 8px 8px 0; padding: 12px 18px; margin: 16px 0; }
  .callout.warn { border-left-color: #d29922; }
  .callout-title { font-weight: 700; color: #39d353; font-size: 10pt; margin-bottom: 4px; }
  .callout.warn .callout-title { color: #d29922; }
  .callout p { font-size: 10pt; color: #8b949e; margin: 0; }

  .mono { font-family: 'JetBrains Mono', monospace; background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 2px 6px; font-size: 9pt; color: #ffa657; }
  .section-tag { font-size: 9pt; font-weight: 700; color: #bc8cff; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 4px; }

  .output-sections { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
  .output-section { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px 14px; }
  .output-section-title { font-size: 10pt; font-weight: 700; color: #58a6ff; margin-bottom: 4px; }
  .output-section-desc  { font-size: 10pt; color: #8b949e; }

  .url-box { font-family: 'JetBrains Mono', monospace; font-size: 12pt; color: #58a6ff; background: #161b22; border: 2px solid #58a6ff; border-radius: 8px; padding: 14px 24px; text-align: center; margin: 20px 0; }

  .footer { text-align: center; font-size: 9pt; color: #444d56; margin-top: 30px; }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover">
  <div class="cover-logo">DumpAnalyzer</div>
  <div class="cover-sub">z/OS SYSDUMP &amp; CEEDUMP Instant Analysis Tool</div>
  <div class="cover-url">${RAILWAY_URL}</div>
  <p style="color:#8b949e;max-width:540px;font-size:11pt;">Upload any IBM z/OS SYSDUMP or CEEDUMP file and receive instant root-cause analysis, z/Architecture instruction decoding, PSW arithmetic, COBOL fix recommendations, and integrity flag detection.</p>
  <div class="cover-badge-row">
    <div class="badge">IBM z/OS</div>
    <div class="badge">COBOL &amp; Language Environment</div>
    <div class="badge">S0C7 · S0C4 · S0CB · S322 · S806</div>
    <div class="badge">Node.js · Express · Railway</div>
  </div>
  <div class="cover-date" style="margin-top:40px;">September 2026</div>
</div>

<!-- PAGE 2: HOW TO USE -->
<div class="page">
  <div class="section-tag">Getting Started</div>
  <h1>How to Use DumpAnalyzer</h1>
  <p>DumpAnalyzer is a zero-install web tool. Open the URL in any browser, upload your dump file, and get analysis in seconds. No account or login required.</p>

  <h2>Step-by-Step Guide</h2>
  <div class="step-grid">
    <div class="step-num">1</div>
    <div class="step-body">
      <div class="step-title">Open the tool in your browser</div>
      <div class="step-desc">Navigate to <strong style="color:#58a6ff;">${RAILWAY_URL}</strong>. You will see the DumpAnalyzer home screen with the upload area and feature summary.</div>
    </div>

    <div class="step-num">2</div>
    <div class="step-body">
      <div class="step-title">Upload your SYSDUMP or CEEDUMP file</div>
      <div class="step-desc">Click <strong>Choose File</strong> or <strong>Upload Dump</strong> (top right), or drag &amp; drop your dump file directly onto the page. Accepted extensions: <span class="mono">.dmp</span> <span class="mono">.txt</span> <span class="mono">.log</span> <span class="mono">.cee</span> <span class="mono">.sys</span> <span class="mono">.sdmp</span>. Maximum file size: <strong>50 MB</strong>.</div>
    </div>

    <div class="step-num">3</div>
    <div class="step-body">
      <div class="step-title">Review the analysis output</div>
      <div class="step-desc">The tool automatically parses and analyzes the dump. The full-screen output contains: abend summary, root cause box, PSW arithmetic, instruction decode, fix recommendations, and integrity flags.</div>
    </div>

    <div class="step-num">4</div>
    <div class="step-body">
      <div class="step-title">View the raw dump text (optional)</div>
      <div class="step-desc">Click the <strong>View Raw</strong> button (top right of the analysis page) to open a modal with the original dump text for cross-reference. Press <span class="mono">Escape</span> to close it.</div>
    </div>

    <div class="step-num">5</div>
    <div class="step-body">
      <div class="step-title">Analyze another dump</div>
      <div class="step-desc">Click <strong>← New Analysis</strong> (top left) to return to the home screen and upload a different file.</div>
    </div>
  </div>

  <div class="callout">
    <div class="callout-title">Supported Dump Formats</div>
    <p><strong style="color:#c9d1d9;">SYSDUMP (IEA992I / IEA995I)</strong> — Internally generated by z/OS when a job abends. Contains PSW, registers, storage.<br>
    <strong style="color:#c9d1d9;">SYSDUMP (real z/OS format)</strong> — Files from actual z/OS jobs with <span class="mono">1JOB</span> header, <span class="mono">COMPLETION CODE   SYSTEM =</span>, and embedded <span class="mono">CEE3207S</span> diagnostics.<br>
    <strong style="color:#c9d1d9;">CEEDUMP (CEE3DMP)</strong> — Language Environment structured dump with traceback, working storage, and linkage section.</p>
  </div>
</div>

<!-- PAGE 3: ANALYSIS OUTPUT EXPLAINED -->
<div class="page">
  <div class="section-tag">Understanding the Output</div>
  <h1>Analysis Output Sections</h1>
  <p>After uploading, the output is organized into these sections from top to bottom:</p>

  <div class="output-sections">
    <div class="output-section">
      <div class="output-section-title">Summary Grid</div>
      <div class="output-section-desc">Six key metrics at a glance: <strong>Abend Code</strong> (e.g. S0C7), <strong>Program Name</strong>, <strong>Dump Type</strong> (SYSDUMP/CEEDUMP), <strong>Statement Number</strong>, <strong>Offset</strong> (hex), and <strong>Timestamp</strong>. For SYSDUMPs, also shows Job Name and Step Name.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">Root Cause Analysis Box</div>
      <div class="output-section-desc">The most important section. Shows the abend classification, the failing field and its bad value (e.g. <span class="mono">IN-POL-VALUE = X'404040'</span>), the COBOL statement, and a full narrative explanation of why the abend occurred and what it means technically.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">PSW Arithmetic — Failing Instruction Location</div>
      <div class="output-section-desc">Decodes the Program Status Word to calculate the exact address of the failing instruction: <strong>Failing Instruction Address = PSW Word 2 − ILC</strong>. Shows the next instruction address, the calculated failing instruction address, and the module offset.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">Machine Instruction at Abend</div>
      <div class="output-section-desc">Decodes the raw hex bytes at the failing address into a z/Architecture instruction. For SS-format instructions (AP, SP, MP, DP, ZAP etc.) shows opcode, length fields, base register + displacement for both operands, and the full decode detail.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">Abend Technical Detail</div>
      <div class="output-section-desc">INTCODE, trigger instructions, and COBOL data types affected by this abend type. Full technical description of the hardware exception.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">Fix Recommendations</div>
      <div class="output-section-desc">Three-part fix guidance: (1) numbered restart steps with FILE-AID / SORT utility commands, (2) ready-to-paste COBOL code fix with IS NUMERIC guard, (3) upstream ETL/extract recommendation to prevent recurrence.</div>
    </div>
    <div class="output-section">
      <div class="output-section-title">Dump Integrity Flags</div>
      <div class="output-section-desc">Automatically detected inconsistencies — e.g. S322 found in a CEEDUMP (unusual), ILC ≠ 6 for a packed-decimal abend, 24-bit AMODE when 31-bit expected.</div>
    </div>
  </div>
</div>

<!-- PAGE 4: SUPPORTED ABEND CODES -->
<div class="page">
  <div class="section-tag">Reference</div>
  <h1>Supported Abend Codes &amp; API</h1>

  <h2>Recognized z/OS Abend Codes</h2>
  <table class="feature-table">
    <thead><tr><th>Abend Code</th><th>Name</th><th>Common Cause in COBOL</th></tr></thead>
    <tbody>
      <tr><td>S0C7</td><td>Data Exception</td><td>COMP-3 field contains EBCDIC spaces (X'40') or invalid nibbles — triggers on AP/SP/MP/DP/ZAP/CP/ED</td></tr>
      <tr><td>S0C4</td><td>Protection Exception</td><td>Null or uninitialized COBOL POINTER used as base register — triggers on MVC/ST/L</td></tr>
      <tr><td>S0CB</td><td>Decimal Divide Exception</td><td>DIVIDE statement or COMPUTE with / operator where divisor is zero — triggers on DP</td></tr>
      <tr><td>S322</td><td>CPU Time Limit Exceeded</td><td>Infinite PERFORM UNTIL loop (exit condition never set) — job cancelled by JES2 timer</td></tr>
      <tr><td>S806</td><td>Load Module Not Found</td><td>CALL to a sub-program whose load module is not in STEPLIB, JOBLIB, or LINKLIST</td></tr>
    </tbody>
  </table>

  <h2>REST API Endpoint</h2>
  <p>The analyzer exposes a single endpoint for programmatic use:</p>
  <div class="callout">
    <div class="callout-title">POST /api/analyze</div>
    <p>Send a <span class="mono">multipart/form-data</span> request with field <span class="mono">dumpFile</span> containing the dump file. Returns a JSON object with <span class="mono">type</span>, <span class="mono">summary</span>, parsed sections, and a rich <span class="mono">analysis</span> object including <span class="mono">rootNarrative</span>, <span class="mono">instrDecode</span>, <span class="mono">pswDecode</span>, <span class="mono">cobolFix</span>, <span class="mono">immediateSteps</span>, and <span class="mono">integrityFlags</span>.</p>
  </div>

  <div class="callout warn">
    <div class="callout-title">Data Privacy</div>
    <p>DumpAnalyzer processes files entirely in memory — uploaded dump files are <strong style="color:#c9d1d9;">not persisted to disk</strong> on the server. Each request is stateless. Do not upload dumps containing production customer PII without appropriate data classification approval.</p>
  </div>

  <h2>Links</h2>
  <div class="url-box">${RAILWAY_URL}</div>
  <p style="text-align:center;color:#8b949e;font-size:10pt;">GitHub: <strong style="color:#58a6ff;">https://github.com/anuragbhumca07/DumpAnalyzer</strong></p>
  <div class="footer">DumpAnalyzer · Built with Node.js, Express, Playwright · Deployed on Railway · September 2026</div>
</div>

</body>
</html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdfPath = path.join(__dirname, 'How to use.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
  });
  await browser.close();
  console.log('PDF created:', pdfPath);
})();
