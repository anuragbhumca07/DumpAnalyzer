// @ts-check
'use strict';

const { test, expect, request } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSYSDUMP({ job='CLMD453', step='STEP080', abend='0C7', prog='PAYCALC',
                       offset='00002C86', stmt=510, field='IN-POL-VALUE', badVal="X'404040'" } = {}) {
  return [
    `1JOB ${job}    STEP ${step}    TIME 005320   DATE 26245   ID = 000`,
    ` COMPLETION CODE   SYSTEM = ${abend}  REASON CODE = 00000007`,
    ` PSW AT ENTRY TO ABEND   078D1000 AE4CAC86  ILC 06  INTC 0007`,
    `   PSW LOAD MODULE             ADDRESS = 2E4CAC86  OFFSET = ${offset}`,
    `   NAME=${prog}`,
    `   DATA AT PSW  2E4CAC80  -  FA32D0A8 D0B00A08  44DDF43F`,
    ` CEE DUMP (LANGUAGE ENVIRONMENT)`,
    `   CEE3207S The system detected a data exception (System Completion Code=0C7).`,
    `   From compile unit ${prog} at entry point ${prog} at statement ${stmt} at compile unit offset +${offset} at entry offset +${offset}`,
    `   at address 2E4CAC86.`,
    `   Data field ${field} contains ${badVal} which is not valid packed decimal.`,
  ].join('\n');
}

function makeInternalSYSDUMP() {
  return [
    `JOB PASWITHR STEP WDPOST ABEND S0C7`,
    `SYSTEM COMPLETION CODE=S0C7  REASON CODE=00000001`,
    `TIME=13.27.42  SEQ=02456  CPU=0000  ASID=0023`,
    `PSW AT TIME OF ERROR  078D1000 1F4016A6  ILC 6  INTCODE=0007`,
    `ACTIVE LOAD MODULE  ADDRESS=1F400000  OFFSET=0016A0`,
    ` NAME=WITHDRAW`,
    `DATA AT PSW  1F4016A0 - F842D0A8C050 AABB CCDD`,
    `GR 0: 00000000   GR 1: 1F400000   GR 2: 00001234`,
  ].join('\n');
}

function makeCEEDUMP() {
  return [
    `CEE3DMP V2 R1.0:  31 bit  COBOL  28 Sep 2026 13:27:42`,
    `  Token: CEE0001`,
    `  CEE3207S The system detected a data exception`,
    `  Program Unit: POLISSUE`,
    `  PU Type: COBOL`,
    `  PU Address: 1F400000`,
    `  Statement: 14`,
    `  Offset: X'001234'`,
    `  DSA Address: 1F500000`,
    `  01 LK-ISSUE-AGE PIC S9(3) COMP-3`,
    `  Value: INVALID`,
    `  LK-POLICY-NO = '12345678'`,
  ].join('\n');
}

function writeTmp(content, ext = '.dmp') {
  const f = path.join(os.tmpdir(), `test_${Date.now()}${ext}`);
  fs.writeFileSync(f, content, 'utf8');
  return f;
}

// ── Page load & hero ──────────────────────────────────────────────────────────

test('page loads with DumpAnalyzer title and upload button', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/DumpAnalyzer/i);
  await expect(page.locator('.topbar-logo')).toContainText('DumpAnalyzer');
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('.upload-topbtn')).toBeVisible();
  await expect(page.locator('.drop-zone')).toBeVisible();
});

test('feature chips are shown on hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.feature-chips')).toBeVisible();
  await expect(page.locator('.chip').first()).toContainText('Root Cause');
});

// ── API health ────────────────────────────────────────────────────────────────

test('GET /api/health returns ok', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body.status).toBe('ok');
});

// ── Upload — external SYSDUMP (PAYCALC format) ────────────────────────────────

test('upload external SYSDUMP shows S0C7 analysis for PAYCALC', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.fh-sys')).toBeVisible();
  await expect(page.locator('.info-item-value.abend')).toContainText('S0C7');
  await expect(page.locator('.info-item-value.prog')).toContainText('PAYCALC');
  await expect(page.locator('.info-item-value.stmt')).toContainText('510');
  fs.unlinkSync(tmp);
});

test('upload external SYSDUMP shows root cause box with bad field', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.rc-box')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.rc-box-title')).toContainText('S0C7');
  await expect(page.locator('.rc-val.bad').first()).toContainText('IN-POL-VALUE');
  fs.unlinkSync(tmp);
});

test('upload external SYSDUMP shows AP instruction decode', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.instr-box')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.instr-raw')).toContainText('FA');
  await expect(page.locator('.instr-val').first()).toContainText('AP');
  fs.unlinkSync(tmp);
});

test('upload external SYSDUMP shows PSW arithmetic', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.tech-table').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.tech-table').first()).toContainText('PSW Word');
  fs.unlinkSync(tmp);
});

test('upload external SYSDUMP shows COBOL fix recommendation', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.cobol-fix-block')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.cobol-fix-block')).toContainText('IN-POL-VALUE');
  fs.unlinkSync(tmp);
});

test('upload external SYSDUMP shows rootNarrative text', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.rc-narrative')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.rc-narrative')).toContainText('PAYCALC');
  await expect(page.locator('.rc-narrative')).toContainText('S0C7');
  fs.unlinkSync(tmp);
});

// ── Upload — internal SYSDUMP ─────────────────────────────────────────────────

test('upload internal-format SYSDUMP (WITHDRAW S0C7) extracts program name', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeInternalSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.info-item-value.prog')).toContainText('WITHDRAW');
  await expect(page.locator('.info-item-value.abend')).toContainText('S0C7');
  fs.unlinkSync(tmp);
});

// ── Upload — CEEDUMP ──────────────────────────────────────────────────────────

test('upload CEEDUMP shows CEEDUMP badge and program', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeCEEDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.fh-cee')).toBeVisible();
  await expect(page.locator('.info-item-value.prog')).toContainText('POLISSUE');
  fs.unlinkSync(tmp);
});

test('upload CEEDUMP shows statement number', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeCEEDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('.info-item-value.stmt')).toContainText('14', { timeout: 10000 });
  fs.unlinkSync(tmp);
});

// ── Error handling ────────────────────────────────────────────────────────────

test('uploading empty file shows error banner', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp('', '.dmp');
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#errorBanner')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#errorBanner')).toContainText('empty');
  fs.unlinkSync(tmp);
});

test('uploading unrecognized text shows UNKNOWN type but no crash', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp('This is not a dump file at all.\nJust random text.');
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.info-item-value.type')).toContainText('UNKNOWN');
  fs.unlinkSync(tmp);
});

// ── Navigation ────────────────────────────────────────────────────────────────

test('New Analysis button resets to hero', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await page.locator('#newBtn').click();
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page.locator('#analysisPage')).toBeHidden();
  fs.unlinkSync(tmp);
});

test('View Raw button opens raw modal', async ({ page }) => {
  await page.goto('/');
  const content = makeSYSDUMP();
  const tmp = writeTmp(content);
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await page.locator('.raw-btn').click();
  await expect(page.locator('#rawModal')).toHaveClass(/active/);
  await expect(page.locator('#rawContent')).toContainText('PAYCALC');
  fs.unlinkSync(tmp);
});

test('Escape closes raw modal', async ({ page }) => {
  await page.goto('/');
  const tmp = writeTmp(makeSYSDUMP());
  await page.locator('#uploadInput').setInputFiles(tmp);
  await expect(page.locator('#analysisPage')).toBeVisible({ timeout: 10000 });
  await page.locator('.raw-btn').click();
  await expect(page.locator('#rawModal')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#rawModal')).not.toHaveClass(/active/);
  fs.unlinkSync(tmp);
});

// ── API direct ────────────────────────────────────────────────────────────────

test('POST /api/analyze with SYSDUMP returns structured JSON', async ({ request }) => {
  const content = makeSYSDUMP();
  const formData = new (require('@playwright/test').request.constructor || Object)();
  // Use fetch-style multipart via request context
  const r = await request.post('/api/analyze', {
    multipart: { dumpFile: { name: 'test.dmp', mimeType: 'text/plain', buffer: Buffer.from(content) } }
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body.type).toBe('SYSDUMP');
  expect(body.summary.abendCode).toBe('S0C7');
  expect(body.summary.programName).toBe('PAYCALC');
  expect(body.summary.statement).toBe(510);
  expect(body.analysis).toBeDefined();
  expect(body.analysis.rootNarrative).toContain('PAYCALC');
  expect(body.analysis.instrDecode.mnem).toBe('AP');
});

test('POST /api/analyze with CEEDUMP returns structured JSON', async ({ request }) => {
  const content = makeCEEDUMP();
  const r = await request.post('/api/analyze', {
    multipart: { dumpFile: { name: 'test.cee', mimeType: 'text/plain', buffer: Buffer.from(content) } }
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body.type).toBe('CEEDUMP');
  expect(body.summary.programName).toBe('POLISSUE');
  expect(body.summary.statement).toBe(14);
});

test('POST /api/analyze with empty file returns 400', async ({ request }) => {
  const r = await request.post('/api/analyze', {
    multipart: { dumpFile: { name: 'empty.dmp', mimeType: 'text/plain', buffer: Buffer.from('') } }
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.error).toContain('empty');
});

test('POST /api/analyze with no file returns 400', async ({ request }) => {
  const r = await request.post('/api/analyze', { data: {} });
  expect(r.status()).toBe(400);
});

test('POST /api/analyze S0C7 returns cobol fix with field name', async ({ request }) => {
  const content = makeSYSDUMP({ field: 'WS-PREMIUM-AMT' });
  const r = await request.post('/api/analyze', {
    multipart: { dumpFile: { name: 'test.dmp', mimeType: 'text/plain', buffer: Buffer.from(content) } }
  });
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body.analysis.cobolFix).toContain('WS-PREMIUM-AMT');
});
