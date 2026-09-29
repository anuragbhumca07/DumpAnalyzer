'use strict';

// ── z/Architecture instruction decode ────────────────────────────────────────

const OPCODES = {
  'FA': { mnem:'AP',   fmt:'SS2', bytes:6, desc:'Add Packed Decimal'         },
  'FB': { mnem:'SP',   fmt:'SS2', bytes:6, desc:'Subtract Packed Decimal'    },
  'FC': { mnem:'MP',   fmt:'SS2', bytes:6, desc:'Multiply Packed Decimal'    },
  'FD': { mnem:'DP',   fmt:'SS2', bytes:6, desc:'Divide Packed Decimal'      },
  'F8': { mnem:'ZAP',  fmt:'SS2', bytes:6, desc:'Zero and Add Packed'        },
  'F9': { mnem:'CP',   fmt:'SS2', bytes:6, desc:'Compare Packed Decimal'     },
  'F0': { mnem:'SRP',  fmt:'SS3', bytes:6, desc:'Shift and Round Packed'     },
  'D2': { mnem:'MVC',  fmt:'SS1', bytes:6, desc:'Move Character'             },
  'D5': { mnem:'CLC',  fmt:'SS1', bytes:6, desc:'Compare Logical Character'  },
  'DE': { mnem:'ED',   fmt:'SS1', bytes:6, desc:'Edit'                       },
  '58': { mnem:'L',    fmt:'RX',  bytes:4, desc:'Load'                       },
  '50': { mnem:'ST',   fmt:'RX',  bytes:4, desc:'Store'                      },
  '41': { mnem:'LA',   fmt:'RX',  bytes:4, desc:'Load Address'               },
  '47': { mnem:'BC',   fmt:'RX',  bytes:4, desc:'Branch on Condition'        },
  '45': { mnem:'BAL',  fmt:'RX',  bytes:4, desc:'Branch and Link'            },
};

// Packed-decimal byte count → max decimal digits  (COMP-3 PIC size)
const COMP3_DIGITS = {1:2,2:3,3:5,4:7,5:9,6:11,7:13,8:15};

function fmtHex(n, width) { return n.toString(16).toUpperCase().padStart(width,'0'); }

function decodeInstruction(hexStr) {
  if (!hexStr) return null;
  const h = hexStr.replace(/\s/g,'').toUpperCase();
  if (h.length < 4) return null;

  const op   = h.substring(0,2);
  const info = OPCODES[op];
  if (!info) return { raw:hexStr, opcode:op, mnem:'???', desc:'Unknown / not decoded', formatted:'??  ???' };

  // SS2 format  (op L1L2 B1D1D1D1 B2D2D2D2) — packed-decimal instructions
  if (info.fmt === 'SS2' && h.length >= 12) {
    const l1 = parseInt(h[2], 16);
    const l2 = parseInt(h[3], 16);
    const b1 = parseInt(h[4], 16);
    const d1 = parseInt(h.substring(5,8), 16);
    const b2 = parseInt(h[8], 16);
    const d2 = parseInt(h.substring(9,12), 16);
    const len1 = l1 + 1, len2 = l2 + 1;

    const formatted = `${op} ${h[2]}${h[3]} ${h.substring(4,8)} ${h.substring(8,12)}`;
    const operand1  = `D${fmtHex(d1,4)}(R${b1})  [${len1} bytes → PIC S9(${COMP3_DIGITS[len1]||len1*2-1}) COMP-3]`;
    const operand2  = `D${fmtHex(d2,4)}(R${b2})  [${len2} bytes → PIC S9(${COMP3_DIGITS[len2]||len2*2-1}) COMP-3]`;
    const decode    = `${info.mnem}: M(R${b1}+${fmtHex(d1,3)}, ${len1}B) ← M(R${b1}+${fmtHex(d1,3)}, ${len1}B) OP M(R${b2}+${fmtHex(d2,3)}, ${len2}B)`;

    return { raw:hexStr, opcode:op, mnem:info.mnem, desc:info.desc,
             fmt:'SS (Storage-to-Storage, 6 bytes)', formatted, operand1, operand2, decode,
             detail:`Opcode ${op} = ${info.mnem} (${info.desc}). ` +
               `Byte 1: ${h[2]}${h[3]} → L1=${l1} (op1 length ${len1} bytes), L2=${l2} (op2 length ${len2} bytes). ` +
               `Bytes 2-3: ${h.substring(4,8)} → op1 = base R${b1} + disp X'${fmtHex(d1,3)}'. ` +
               `Bytes 4-5: ${h.substring(8,12)} → op2 = base R${b2} + disp X'${fmtHex(d2,3)}'.` };
  }

  // SS1 format (op L B1D1 B2D2)
  if (info.fmt === 'SS1' && h.length >= 12) {
    const L  = parseInt(h[2],16)*16 + parseInt(h[3],16);
    const b1 = parseInt(h[4],16); const d1 = parseInt(h.substring(5,8),16);
    const b2 = parseInt(h[8],16); const d2 = parseInt(h.substring(9,12),16);
    const len = L + 1;
    const formatted = `${op} ${h[2]}${h[3]} ${h.substring(4,8)} ${h.substring(8,12)}`;
    return { raw:hexStr, opcode:op, mnem:info.mnem, desc:info.desc,
             fmt:'SS (Storage-to-Storage, 6 bytes)', formatted,
             operand1:`X'${fmtHex(d1,3)}'(R${b1}) length ${len}`,
             operand2:`X'${fmtHex(d2,3)}'(R${b2})`,
             decode:`${info.mnem}: ${len} bytes from R${b2}+${fmtHex(d2,3)} → R${b1}+${fmtHex(d1,3)}`,
             detail:`Opcode ${op} = ${info.mnem} (${info.desc}). Length = ${len} bytes.` };
  }

  // RX format (op R1X2 B2D2)
  if (info.fmt === 'RX' && h.length >= 8) {
    const r1 = parseInt(h[2],16); const x2 = parseInt(h[3],16);
    const b2 = parseInt(h[4],16); const d2 = parseInt(h.substring(5,8),16);
    const formatted = `${op} ${h[2]}${h[3]} ${h.substring(4,8)}`;
    const mask = ['NOP','BO','BH','BNL','BL','BNH','BE','BNE','BNE','BNL','BNH','BL','BNH','BH','BNO','B'][r1]||r1;
    const bDesc = op === '47' ? ` (${mask} — ${r1===15?'unconditional branch':r1===0?'NOP':'conditional branch'})` : '';
    return { raw:hexStr, opcode:op, mnem:info.mnem, desc:info.desc,
             fmt:'RX (Register/Indexed Storage, 4 bytes)', formatted,
             operand1:`R${r1}${bDesc}`, operand2:`X'${fmtHex(d2,3)}'(R${x2},R${b2})`,
             decode:`${info.mnem} R${r1},${fmtHex(d2,3)}(R${x2},R${b2})${bDesc}`,
             detail:`Opcode ${op} = ${info.mnem}${bDesc}. R1=${r1}, X2=${x2}, B2=${b2}, D2=X'${fmtHex(d2,3)}'.` };
  }

  return { raw:hexStr, opcode:op, mnem:info.mnem, desc:info.desc, formatted:hexStr };
}

// ── PSW decode ────────────────────────────────────────────────────────────────

function analyzePSW(psw, moduleBase) {
  if (!psw || !psw.word2) return null;
  const w2 = parseInt(psw.word2.replace(/'/g,''), 16);
  if (isNaN(w2)) return null;

  const is31   = !!(w2 & 0x80000000);
  const nextIA = w2 & 0x7FFFFFFF;
  const ilc    = typeof psw.ilc === 'number' ? psw.ilc : parseInt(psw.ilc) || 4;
  const failIA = nextIA - ilc;

  let moduleOffset = null;
  if (moduleBase) {
    const base = parseInt(moduleBase.replace(/'/g,''), 16) & 0x7FFFFFFF;
    moduleOffset = failIA - base;
  }

  return {
    word1:          psw.word1,
    word2:          psw.word2,
    intcode:        psw.intcode,
    ilc,
    addressMode:    is31 ? '31-bit (RMODE 31 / AMODE 31)' : '24-bit (AMODE 24)',
    nextInstHex:    fmtHex(nextIA, 8),
    failInstHex:    fmtHex(failIA, 8),
    moduleOffset:   moduleOffset !== null ? fmtHex(moduleOffset, 6) : null,
    arithmetic:     `Failing instruction: X'${fmtHex(nextIA,8)}' − ILC ${ilc} = X'${fmtHex(failIA,8)}'`,
    is31
  };
}

// ── Per-abend technical detail ────────────────────────────────────────────────

const ABEND_DETAIL = {
  S0C7: {
    shortName: 'Data Exception',
    intcode:   '0007',
    techDesc:  'The hardware decimal-instruction unit detected invalid digit or sign nibbles in a packed-decimal (COMP-3) field. Valid EBCDIC packed decimal requires nibbles 0–9 for each digit position and C, D, or F for the rightmost (sign) nibble. Spaces (X\'40\') fail both tests.',
    triggerInstr: ['ZAP','AP','SP','MP','DP','CP','ED','EDMK'],
    cobolTypes:   'COMP-3, DISPLAY (zoned decimal), or COMPUTATIONAL packed fields'
  },
  S0CB: {
    shortName: 'Decimal Divide Exception',
    intcode:   '000B',
    techDesc:  'A DP (Divide Packed) instruction was attempted with a divisor field containing zero. z/Architecture prohibits division by zero for packed decimal just as it does for binary. Language Environment converts this to a COBOL DIVIDE ZERO-DIVIDE condition.',
    triggerInstr: ['DP'],
    cobolTypes:   'DIVIDE statement or COMPUTE with a / operator'
  },
  S0C4: {
    shortName: 'Protection Exception',
    intcode:   '0004',
    techDesc:  'The hardware memory-management unit denied a storage access because the effective address fell outside the program\'s authorized address space or into a read-only segment. Typical causes: null pointer (X\'00000000\'), uninitialized COBOL POINTER, incorrect base-register displacement, or an index that overflowed its array bounds.',
    triggerInstr: ['MVC','ST','L','STM'],
    cobolTypes:   'POINTER, INDEX, ADDRESS OF, or subscript out-of-bounds'
  },
  S322: {
    shortName: 'CPU Time Limit Exceeded',
    intcode:   '0322',
    techDesc:  'The job\'s CPU timer expired. JES2 cancelled the address space when total CPU usage reached the TIME= parameter on the step. This always indicates a runaway loop or unexpectedly large input dataset. The PSW and registers point to wherever the CPU happened to be when the timer interrupt fired.',
    triggerInstr: ['BC','BCT','BXH','BXLE','BRCT'],
    cobolTypes:   'Runaway PERFORM UNTIL / PERFORM n TIMES loop'
  },
  S806: {
    shortName: 'Load Module Not Found',
    intcode:   '0806',
    techDesc:  'The program loader could not locate the requested load module in any library in the STEPLIB DD concatenation, JOBLIB, LINKLIST, or LPA. IEA800I (program fetch) issued reason code 00000004 — module not found.',
    triggerInstr: ['L/BALR (CALL)'],
    cobolTypes:   'CALL statement or dynamic ENTRY reference'
  }
};

// ── Per-program, per-abend context ────────────────────────────────────────────

const PROG_CTX = {
  WITHDRAW: {
    S0C7: {
      badField:   'LK-SURR-CHARGE-PCT',
      badValue:   "X'FAFAFAF0C0FF' — invalid packed decimal nibbles",
      instrMnem:  'ZAP',
      instrBytes: 'F842D0A8C050',
      instrNote:  'ZAP loaded the invalid source field into the packed accumulator before the multiply',
      cobolStmt:  'COMPUTE WS-SURR-CHARGE ROUNDED = WS-EXCESS-AMT * LK-SURR-CHARGE-PCT',
      cobolFix: `       IF LK-SURR-CHARGE-PCT IS NUMERIC
           COMPUTE WS-SURR-CHARGE ROUNDED =
               WS-EXCESS-AMT * LK-SURR-CHARGE-PCT
       ELSE
           MOVE ZERO  TO WS-SURR-CHARGE
           ADD  1     TO WS-BAD-INPUT-CNT
           PERFORM 9900-LOG-DATA-ERROR
           MOVE 'E304' TO LK-RETURN-CODE
           MOVE 'SURRENDER CHARGE PCT IS NON-NUMERIC'
               TO LK-MESSAGE
           PERFORM 9999-RETURN
       END-IF`,
      upstream: 'Validate the SURR-CHARGE-PCT field on the policy master extract. Write packed zero (X\'00000C\') for missing values rather than spaces.'
    },
    S0CB: {
      badField:   'LK-ACCT-VALUE (near zero)',
      badValue:   'Account value ≤ 0.00 — causes DP zero-divisor',
      instrMnem:  'DP',
      instrBytes: 'FD62D048C060',
      instrNote:  'DP divided by account value to compute free-withdrawal percentage denominator',
      cobolStmt:  'COMPUTE WS-FREE-WD-ALLOW = (LK-ACCT-VALUE * WS-FREE-WD-PCT) - LK-PRIOR-WD-YTD',
      cobolFix: `       IF LK-ACCT-VALUE > ZERO
           COMPUTE WS-FREE-WD-ALLOW =
               (LK-ACCT-VALUE * WS-FREE-WD-PCT) - LK-PRIOR-WD-YTD
       ELSE
           MOVE ZERO TO WS-FREE-WD-ALLOW
       END-IF`,
      upstream: 'Pre-screen input for policies with zero account value and route them to an exclusion report rather than the withdrawal program.'
    },
    S0C4: {
      badField:   'WS-SURR-CHARGE (target address in linkage)',
      badValue:   'Null or invalid address — LK-SURR-CHARGE-OUT pointer not initialized',
      instrMnem:  'MVC',
      instrBytes: 'D206D050D0B0',
      instrNote:  'MVC attempted to move WS-SURR-CHARGE into LK-SURR-CHARGE-OUT at an invalid address',
      cobolStmt:  'MOVE WS-SURR-CHARGE TO LK-SURR-CHARGE-OUT',
      cobolFix: `       *> Ensure output linkage area is SET before use
       IF ADDRESS OF LK-WD-OUT NOT EQUAL NULL
           MOVE WS-SURR-CHARGE TO LK-SURR-CHARGE-OUT
       ELSE
           MOVE 'E399' TO LK-RETURN-CODE
           MOVE 'OUTPUT LINKAGE NOT INITIALIZED' TO LK-MESSAGE
           PERFORM 9999-RETURN
       END-IF`,
      upstream: 'Ensure the calling program passes a valid output area address in the CALL statement for WITHDRAW.'
    }
  },
  PAYMENT: {
    S0C7: {
      badField:   'LK-PAY-AMOUNT',
      badValue:   "X'404040' = three EBCDIC spaces — not valid packed decimal",
      instrMnem:  'AP',
      instrBytes: 'FA62D050C070',
      instrNote:  'AP tried to add the blank payment amount to the account value accumulator',
      cobolStmt:  'COMPUTE LK-NEW-ACCT-VALUE = LK-CURR-ACCT-VALUE + LK-PAY-AMOUNT',
      cobolFix: `       IF LK-PAY-AMOUNT IS NUMERIC AND LK-PAY-AMOUNT > ZERO
           COMPUTE LK-NEW-ACCT-VALUE =
               LK-CURR-ACCT-VALUE + LK-PAY-AMOUNT
       ELSE
           MOVE 'E202' TO LK-RETURN-CODE
           MOVE 'PAYMENT AMOUNT IS INVALID OR ZERO' TO LK-MESSAGE
           PERFORM 9999-RETURN
       END-IF`,
      upstream: 'The payment record extract must write packed zero (X\'00000C\') for missing amounts, not spaces or binary zeros.'
    },
    S322: {
      badField:   '1000-VALIDATE loop counter',
      badValue:   'Loop counter never incremented — infinite PERFORM UNTIL loop',
      instrMnem:  'BC 15',
      instrBytes: '47F0D520',
      instrNote:  'BC 15 (unconditional branch) — the loop exit condition is never reached',
      cobolStmt:  'PERFORM 1000-VALIDATE UNTIL WS-VALIDATE-DONE = \'Y\'',
      cobolFix: `       MOVE ZERO TO WS-VALIDATE-CTR
       PERFORM 1000-VALIDATE
           WITH TEST BEFORE
           UNTIL WS-VALIDATE-DONE = 'Y'
               OR WS-VALIDATE-CTR > 10000
           ADD 1 TO WS-VALIDATE-CTR
       END-PERFORM
       IF WS-VALIDATE-CTR > 10000
           MOVE 'E999' TO LK-RETURN-CODE
           MOVE 'VALIDATE EXCEEDED ITERATION LIMIT' TO LK-MESSAGE
           PERFORM 9999-RETURN
       END-IF`,
      upstream: 'Review 1000-VALIDATE to ensure WS-VALIDATE-DONE is set to \'Y\' before the PERFORM exits.'
    },
    S806: {
      badField:   'PAYVALD (sub-module)',
      badValue:   'Module not found in any STEPLIB library',
      instrMnem:  'BAL',
      instrBytes: '45E0C064',
      instrNote:  'Program loader could not find PAYVALD in STEPLIB or LINKLIST',
      cobolStmt:  'CALL \'PAYVALD\' USING ...',
      cobolFix: `       *> No COBOL change — fix the JCL STEPLIB:
       //STEPLIB  DD DSN=PROD.LOADLIB,DISP=SHR
       //         DD DSN=PROD.PASLIB,DISP=SHR   ← add PAYVALD's library

       *> If PAYVALD should be dynamically loaded, add ON EXCEPTION:
       CALL 'PAYVALD' USING LK-PAY-IN LK-PAY-OUT
           ON EXCEPTION
               MOVE 'E998' TO LK-RETURN-CODE
               MOVE 'PAYVALD MODULE NOT AVAILABLE' TO LK-MESSAGE
               PERFORM 9999-RETURN
       END-CALL`,
      upstream: 'Verify PAYVALD is assembled, linked, and promoted to the correct load library for this environment.'
    }
  },
  POLISSUE: {
    S0C7: {
      badField:   'LK-ISSUE-AGE',
      badValue:   "Blanks (X'404040') — not valid packed decimal",
      instrMnem:  'SP',
      instrBytes: 'FB21D044C040',
      instrNote:  'SP tried to subtract the blank age field from WS-CALC-MATURITY-AGE',
      cobolStmt:  'COMPUTE WS-YEARS-TO-MATURITY = WS-CALC-MATURITY-AGE - LK-ISSUE-AGE',
      cobolFix: `       IF LK-ISSUE-AGE IS NUMERIC
           COMPUTE WS-YEARS-TO-MATURITY =
               WS-CALC-MATURITY-AGE - LK-ISSUE-AGE
       ELSE
           MOVE 'E101' TO LK-RETURN-CODE
           MOVE 'ISSUE AGE IS NON-NUMERIC' TO LK-MESSAGE
           PERFORM 9999-RETURN
       END-IF`,
      upstream: 'The policy application extract must include a numeric age; blank age must be rejected at the front-end.'
    },
    S0CB: {
      badField:   'LK-CO-FREELOOK-DAYS (zero)',
      badValue:   '0 — zero divisor in free-look end-date calculation',
      instrMnem:  'DP',
      instrBytes: 'FD62D048C044',
      instrNote:  'DP divided by LK-CO-FREELOOK-DAYS which was zero or not initialized',
      cobolStmt:  'COMPUTE LK-FREE-LOOK-END = LK-ISSUE-DATE + LK-CO-FREELOOK-DAYS',
      cobolFix: `       IF LK-CO-FREELOOK-DAYS > ZERO
           COMPUTE LK-FREE-LOOK-END =
               LK-ISSUE-DATE + LK-CO-FREELOOK-DAYS
       ELSE
           ADD 10 TO LK-ISSUE-DATE GIVING LK-FREE-LOOK-END
           *> default 10-day free-look per regulatory requirement
       END-IF`,
      upstream: 'The company parameter table must always carry a non-zero LK-CO-FREELOOK-DAYS. Add a parameter validation step before POLISSUE runs.'
    }
  },
  DEATHCLM: {
    S0C7: {
      badField:   'WS-BENEFIT-FACTOR',
      badValue:   "X'FAFAFAFAFA' — invalid packed decimal nibbles",
      instrMnem:  'MP',
      instrBytes: 'FC62D040D060',
      instrNote:  'MP tried to multiply the account value by WS-BENEFIT-FACTOR which contains invalid data',
      cobolStmt:  'COMPUTE LK-DEATH-BENEFIT = LK-ACCT-VALUE * WS-BENEFIT-FACTOR',
      cobolFix: `       IF WS-BENEFIT-FACTOR IS NUMERIC AND WS-BENEFIT-FACTOR > ZERO
           COMPUTE LK-DEATH-BENEFIT =
               LK-ACCT-VALUE * WS-BENEFIT-FACTOR
       ELSE
           MOVE LK-ACCT-VALUE TO LK-DEATH-BENEFIT
           MOVE 'ACCOUNT VALUE' TO LK-BENEFIT-BASIS
       END-IF`,
      upstream: 'The benefit factor table load (prior step) must validate that all factors are non-zero numeric values before DEATHCLM runs.'
    },
    S0C4: {
      badField:   'WS-CLAIM-LOOKUP-PTR',
      badValue:   "X'00000000' — null pointer, never SET before use",
      instrMnem:  'MVC',
      instrBytes: 'D208D040D070',
      instrNote:  'MVC used WS-CLAIM-LOOKUP-PTR as a base register but it contained a null address',
      cobolStmt:  'MOVE WS-CLAIM-LOOKUP-PTR TO LK-CLAIM-REF',
      cobolFix: `       IF WS-CLAIM-LOOKUP-PTR NOT EQUAL NULL
           MOVE WS-CLAIM-LOOKUP-PTR TO LK-CLAIM-REF
       ELSE
           PERFORM 8500-LOOKUP-CLAIM
           IF WS-LOOKUP-STATUS = 'OK'
               SET WS-CLAIM-LOOKUP-PTR TO ADDRESS OF WS-CLAIM-REC
               MOVE WS-CLAIM-LOOKUP-PTR TO LK-CLAIM-REF
           ELSE
               MOVE 'E502' TO LK-RETURN-CODE
               MOVE 'CLAIM RECORD NOT FOUND' TO LK-MESSAGE
               PERFORM 9999-RETURN
           END-IF
       END-IF`,
      upstream: 'Ensure 8500-LOOKUP-CLAIM is called and returns successfully before Statement 8 is reached.'
    }
  }
};

// ── Immediate fix steps ───────────────────────────────────────────────────────

function getImmediateFix(abend, prog, meta) {
  const job  = (meta && meta.jobName)  || 'the job';
  const step = (meta && meta.stepName) || 'this step';
  const ctx  = (PROG_CTX[prog] || {})[abend];
  const field = ctx ? ctx.badField : 'the failing field';

  const STEPS = {
    S0C7: [
      `Locate input records where ${field} contains non-numeric data.`,
      `Use a SORT utility or File-AID to find them:`,
      `  SORT FIELDS=COPY,INCLUDE COND=(pos,len,CH,GE,X'000000')`,
      `Correct the invalid records (write packed zero X'00000C' for missing values), or route them to a reject file.`,
      `Restart ${job} at ${step} after repairing the input.`,
      `Check and delete any partial output GDG generation written before the abend.`
    ],
    S0CB: [
      `Locate input records where the divisor field (${field}) is zero.`,
      `Apply a fix or exclusion rule: route zero-value records to a reject report.`,
      `Restart ${job} at ${step} after repairing the input.`
    ],
    S0C4: [
      `This is a null/invalid-pointer exception — no input record fix is needed.`,
      `Apply the permanent code fix below (COBOL pointer guard).`,
      `Recompile and re-link ${prog} into the load library.`,
      `Restart ${job} at ${step}.`
    ],
    S322: [
      `Increase the TIME= parameter temporarily to allow the job to complete while you investigate:`,
      `  //${step.padEnd(8)} EXEC PGM=${prog},TIME=0005`,
      `Apply the permanent loop-guard fix and recompile.`,
      `Restart ${job} at ${step}.`
    ],
    S806: [
      `Verify the missing module exists in a load library:`,
      `  TSO LISTLOAD OUTPUT(PAYVALD) STORAGE(PROD.LOADLIB)`,
      `Add the correct library to the STEPLIB DD concatenation (see fix below).`,
      `If the module is missing, request an emergency promotion from the change-management team.`,
      `Restart ${job} at ${step} after updating the JCL.`
    ]
  };

  return STEPS[abend] || [`Review Statement ${step} in ${prog} and apply the appropriate fix.`];
}

// ── Integrity flags ───────────────────────────────────────────────────────────

function checkIntegrity(dump, meta) {
  const flags = [];
  if (!dump) return flags;

  const abend = (dump.summary || {}).abendCode;
  const type  = dump.type;

  if (abend === 'S322' && type === 'CEEDUMP')
    flags.push({ level:'warn', msg:'S322 (CPU cancel) normally produces a SYSDUMP or SYSABEND output — LE rarely writes a full CEEDUMP because the OS cancels the job without giving LE a chance to run termination handlers.' });

  if (abend === 'S806' && type === 'CEEDUMP')
    flags.push({ level:'warn', msg:'S806 (load module not found) should produce a SYSDUMP/SYSABEND — LE never gains control when the program loader fails before entering the module.' });

  if (type === 'SYSDUMP' && dump.psw) {
    const ilc = parseInt(dump.psw.ilc) || 0;
    if ((abend === 'S0C7' || abend === 'S0CB') && ilc !== 6)
      flags.push({ level:'info', msg:`ILC=${ilc} is unusual for ${abend} — packed-decimal instructions (FA/FB/FC/FD/F8/F9) are SS-format, always 6 bytes, so ILC should be 6. A value of ${ilc} may indicate a simulated or reconstructed dump.` });

    if (dump.psw.word2) {
      const w2 = parseInt(dump.psw.word2, 16);
      if (!isNaN(w2) && !(w2 & 0x80000000))
        flags.push({ level:'info', msg:`PSW word 2 bit 0 is clear — the program is in 24-bit addressing mode (AMODE 24). Enterprise COBOL compiled with AMODE(31) always runs in 31-bit mode; this may indicate an older COBOL II or VS COBOL II program.` });
    }
  }

  if (type === 'CEEDUMP' && dump.traceback) {
    const frames = dump.traceback;
    if (frames.length > 0 && frames.length < 2)
      flags.push({ level:'info', msg:'Call chain has only 1 frame. A normal LE COBOL program produces at least 3 frames: the abending COBOL program, a COBOL runtime stub (IGZCPAC), and CEEBINIT.' });
  }

  if (type === 'CEEDUMP' && dump.workingStorage && dump.workingStorage.length === 0)
    flags.push({ level:'info', msg:'Working storage snapshot is empty. Recompile the program with the SSRANGE or TEST(ALL) option to capture variable values at abend time.' });

  return flags;
}

// ── Main entry point ──────────────────────────────────────────────────────────

function analyzeAbend(dump, meta) {
  if (!dump || !dump.summary) return null;

  const abend    = dump.summary.abendCode;
  const prog     = dump.summary.programName;
  const ceeDiag  = dump.ceeDiag || null;

  const abendDetail = ABEND_DETAIL[abend]  || null;
  const progCtx     = (PROG_CTX[prog] || {})[abend] || null;
  const pswDecode   = dump.psw ? analyzePSW(dump.psw, dump.activeModule && dump.activeModule.address) : null;

  // Effective statement/offset: prefer summary, fall back to inline CEE diagnostics
  const effectiveStatement = dump.summary.statement || (ceeDiag && ceeDiag.statement) || null;
  const rawOffset = (dump.summary.offset && dump.summary.offset !== '?')
    ? dump.summary.offset
    : (ceeDiag && ceeDiag.offset) || '?';
  const offsetStr = rawOffset.startsWith("X'") ? rawOffset : (rawOffset !== '?' ? `X'${rawOffset}'` : `X'?'`);

  // Decode failing instruction — real bytes from dump beat catalog bytes
  let instrDecode = null;
  if (dump.instrBytes) {
    instrDecode = decodeInstruction(dump.instrBytes);
  } else if (progCtx && progCtx.instrBytes) {
    instrDecode = decodeInstruction(progCtx.instrBytes);
  } else if (progCtx && progCtx.instrMnem) {
    instrDecode = { mnem: progCtx.instrMnem, desc: OPCODES_BY_MNEM[progCtx.instrMnem] || '', fromMeta: true };
  }

  const immediateSteps = getImmediateFix(abend, prog, meta);
  const integrityFlags = checkIntegrity(dump, meta);

  // Root cause narrative
  let rootNarrative = '';
  if (abendDetail && progCtx) {
    rootNarrative =
      `${prog} abended with ${abend} (${abendDetail.shortName}) at Statement ${effectiveStatement || '?'}, offset ${offsetStr}. ` +
      `Field ${progCtx.badField} contained invalid data: ${progCtx.badValue}. ` +
      `The ${progCtx.instrMnem} instruction at this statement — "${progCtx.cobolStmt}" — ` +
      `${progCtx.instrNote}. ${abendDetail.techDesc}`;
  } else if (abendDetail && ceeDiag) {
    rootNarrative =
      `${prog} abended with ${abend} (${abendDetail.shortName}) at Statement ${effectiveStatement || '?'}, offset ${offsetStr}. ` +
      (ceeDiag.badField
        ? `Field ${ceeDiag.badField} contained invalid data: ${ceeDiag.badValue || 'not valid packed decimal'}. `
        : '') +
      (instrDecode ? `The failing instruction was ${instrDecode.mnem} (${instrDecode.desc}). ` : '') +
      abendDetail.techDesc;
  } else if (abendDetail) {
    rootNarrative =
      `${prog} abended with ${abend} (${abendDetail.shortName}) at Statement ${effectiveStatement || '?'}, offset ${offsetStr}. ` +
      abendDetail.techDesc;
  } else {
    rootNarrative = `${prog} abended with ${abend} at Statement ${effectiveStatement || '?'}, offset ${offsetStr}.`;
  }

  // Generate generic COBOL fix from CEE diagnostics when no catalog entry exists
  let cobolFix    = progCtx ? progCtx.cobolFix    : null;
  let upstreamFix = progCtx ? progCtx.upstream    : null;

  if (!cobolFix && ceeDiag && ceeDiag.badField && abend === 'S0C7') {
    const f = ceeDiag.badField;
    cobolFix =
`       IF ${f} IS NUMERIC
           CONTINUE  *> existing processing logic here
       ELSE
           MOVE ZERO TO ${f}
           MOVE 'E001' TO WS-RETURN-CODE
           MOVE '${f} IS NON-NUMERIC' TO WS-MESSAGE
           PERFORM 9999-RETURN
       END-IF`;
    upstreamFix =
      `Validate field ${f} on the input extract before this job runs. ` +
      `Write packed zero (X'00000C') for missing or blank values rather than EBCDIC spaces (X'40').`;
  }

  // Synthesize a progCtx-like block for the UI when program not in catalog
  const effectiveProgCtx = progCtx || (ceeDiag ? {
    badField:  ceeDiag.badField  || 'unknown field',
    badValue:  ceeDiag.badValue  || 'invalid packed decimal',
    instrMnem: instrDecode ? instrDecode.mnem : null,
    instrNote: ceeDiag.badField
      ? `${instrDecode ? instrDecode.mnem + ' operated on ' : 'Instruction referenced '}${ceeDiag.badField} which contained ${ceeDiag.badValue || 'invalid data'}`
      : null,
    cobolStmt: null,
    cobolFix,
    upstream:  upstreamFix
  } : null);

  return {
    abendCode:    abend,
    program:      prog,
    statement:    effectiveStatement,
    offset:       rawOffset,
    rootNarrative,
    abendDetail,
    progCtx:      effectiveProgCtx,
    pswDecode,
    instrDecode,
    immediateSteps,
    cobolFix,
    upstreamFix,
    integrityFlags
  };
}

const OPCODES_BY_MNEM = {};
Object.entries(OPCODES).forEach(([k,v]) => { OPCODES_BY_MNEM[v.mnem] = v.desc; });

module.exports = { analyzeAbend, decodeInstruction, analyzePSW };
