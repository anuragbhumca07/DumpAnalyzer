'use strict';

const express      = require('express');
const path         = require('path');
const multer       = require('multer');
const { parse }        = require('./dump-parser');
const { analyzeAbend } = require('./abend-analyzer');
const cobolMapper      = require('./cobol-mapper');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'DumpAnalyzer' }));

// ── Main analysis endpoint — accepts a SYSDUMP or CEEDUMP file, returns full analysis ──
app.post('/api/analyze', upload.single('dumpFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const content = req.file.buffer.toString('utf8');
  if (!content.trim()) return res.status(400).json({ error: 'Uploaded file is empty' });

  try {
    const parsed = parse(content);

    const prog  = parsed.summary && parsed.summary.programName;
    const stmtN = parsed.summary && parsed.summary.statement;
    if (prog && stmtN && prog !== 'UNKNOWN') {
      const info = cobolMapper.getStatementInfo(prog, stmtN);
      if (info) parsed.cobolSource = { programName: prog, stmtNumber: stmtN, ...info };
    }

    const meta = { originalFilename: req.file.originalname, source: 'upload' };
    const analysis = analyzeAbend(parsed, meta);
    if (analysis) parsed.analysis = analysis;

    res.json({ filename: req.file.originalname, ...parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze dump: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DumpAnalyzer running at http://localhost:${PORT}`));
module.exports = app;
