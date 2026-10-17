const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), cp = require('child_process');
const repo = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(repo, 'banco_B400.json'), 'utf8'));
const code = fs.readFileSync(path.join(repo, 'app.js'), 'utf8');
const oldCode = cp.execFileSync('git', ['-c', `safe.directory=${repo}`, 'show', '821d44c926298c99f25075ad785473d603ccd2ba:app.js'], { cwd: repo, encoding: 'utf8' });
const normalize = t => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const parse = (text, length) => /^Todas/i.test(text) ? Array.from({ length }, (_, i) => i + 1) : /^Ninguna/i.test(text) ? [] : (text.match(/\d+/g) || []).map(Number);
const families = new Map();
assert.equal(bank.items.length, 400);
assert.equal(new Set(bank.items.map(q => q.bank_id)).size, 400);
assert.equal(new Set(bank.items.map(q => normalize([q.stem, ...q.statements, ...q.options].join(' ')))).size, 400);
for (const q of bank.items) {
  assert.ok(q.stem.trim().length > 20, q.bank_id);
  assert.equal(q.options.length, 5, q.bank_id);
  assert.equal(q.option_reasons.length, 5, q.bank_id);
  assert.ok(q.option_reasons.every(reason => typeof reason === 'string' && reason.trim()), q.bank_id);
  assert.equal(new Set(q.options.map(normalize)).size, 5, q.bank_id);
  assert.equal(q.answer, String.fromCharCode(97 + q.key), q.bank_id);
  assert.ok(Number.isInteger(q.key) && q.key >= 0 && q.key < 5, q.bank_id);
  assert.ok(q.pages.length && q.pages.every(p => Number.isInteger(p) && p > 0 && p <= 118), q.bank_id);
  assert.ok(!q.official_sources?.length, q.bank_id + ' sin fuente externa necesaria');
  assert.ok(!/\bmanual\b/i.test([q.stem, ...q.statements, ...q.options].join(' ')), q.bank_id);
  assert.ok(!/undefined|NaN|\uFFFD/.test(JSON.stringify(q)), q.bank_id);
  if (q.format === 'Combinación') {
    assert.equal(q.truth.length, q.statements.length, q.bank_id);
    assert.equal(q.statement_reasons.length, q.statements.length, q.bank_id);
    const wanted = q.truth.flatMap((truth, i) => (q.negative ? !truth : truth) ? [i + 1] : []);
    assert.deepEqual(q.options.flatMap((text, i) => JSON.stringify(parse(text, q.truth.length)) === JSON.stringify(wanted) ? [i] : []), [q.key], q.bank_id);
  }
  if (q.format === 'Ordenación' && q.option_sequences) assert.deepEqual(q.option_sequences.flatMap((seq, i) => JSON.stringify(seq) === JSON.stringify(q.correct_sequence) ? [i] : []), [q.key], q.bank_id);
  if (!families.has(q.family_id)) families.set(q.family_id, []);
  families.get(q.family_id).push(q);
}
for (const variants of families.values()) assert.ok(variants.every(q => q.chapter === variants[0].chapter && q.format === variants[0].format));

let seed = 4272026;
function random() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; }
const storage = new Map();
function context(source = code, saved = storage) {
  const math = Object.create(Math); math.random = random;
  const ctx = vm.createContext({ document: { addEventListener() {} }, console, Math: math,
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) } });
  vm.runInContext(source, ctx); ctx.bank = bank;
  vm.runInContext('state.bank = bank.items; state.profile = bank.selection_profile;', ctx);
  return ctx;
}
const ctx = context();
let explanations = 0, maxExplanationWords = 0;
for (const question of bank.items) {
  for (let selected = 0; selected < 5; selected++) {
    const text = ctx.reviewExplanation({ question, selected, isCorrect: selected === question.key, isOmitted: false });
    assert.ok(text.length > 20 && !/undefined|NaN|^Selecciona exactamente/.test(text), question.bank_id);
    maxExplanationWords = Math.max(maxExplanationWords, text.split(/\s+/).length); explanations++;
  }
  assert.ok(ctx.reviewExplanation({ question, selected: undefined, isCorrect: false, isOmitted: true }).length > 20, question.bank_id);
  explanations++;
}
function check(attempt, total) {
  assert.equal(attempt.length, total);
  assert.equal(new Set(attempt.map(q => q.family_id)).size, total);
  const counts = Array.from({ length: 9 }, (_, chapter) => attempt.filter(q => q.chapter === chapter + 1).length);
  if (total === 30) assert.deepEqual(counts, bank.selection_profile.chapter_quotas_30);
  else counts.forEach((n, i) => assert.ok([Math.floor(bank.selection_profile.chapter_quotas_30[i] / 3), Math.ceil(bank.selection_profile.chapter_quotas_30[i] / 3)].includes(n)));
  for (const format of ['Directa', 'Ordenación']) {
    const expected = total * bank.selection_profile.formats[format] / bank.selection_profile.reference_items;
    assert.ok([Math.floor(expected), Math.ceil(expected)].includes(attempt.filter(q => q.format === format).length));
  }
  return counts;
}
const sums = Array(9).fill(0), formats = { Directa: 0, Ordenación: 0 };
for (let i = 0; i < 2000; i++) {
  const total = i < 500 ? 30 : 10, attempt = ctx.sampleAttempt(total), counts = check(attempt, total);
  if (total === 10) {
    counts.forEach((n, j) => sums[j] += n / 1500);
    for (const format of Object.keys(formats)) formats[format] += attempt.filter(q => q.format === format).length / 1500;
  }
}
sums.forEach((n, i) => assert.ok(Math.abs(n - bank.selection_profile.chapter_quotas_30[i] / 3) < .06));
for (const [format, n] of Object.entries(formats)) assert.ok(Math.abs(n - 10 * bank.selection_profile.formats[format] / 91) < .06);

function simulate(source, mode, trials = 12) {
  const checkpoints = mode === '10' ? [2, 5, 10, 20, 30, 50, 100, 150] : [2, 5, 10, 20, 30, 50, 100];
  const results = Object.fromEntries(checkpoints.map(n => [n, { questions: 0, families: 0, pages: 0, previousOverlap: 0 }]));
  let allCoveredBy = [];
  for (let trial = 0; trial < trials; trial++) {
    const c = context(source, new Map()), seen = new Set(), fsSeen = new Set(), pages = new Set();
    let previous = new Set(), overlap = 0, firstComplete = null;
    for (let n = 1; n <= checkpoints.at(-1); n++) {
      const total = mode === 'mixed' ? (n % 2 ? 10 : 30) : Number(mode);
      const attempt = c.sampleAttempt(total); check(attempt, total);
      overlap = attempt.filter(q => previous.has(q.family_id)).length;
      attempt.forEach(q => { seen.add(q.bank_id); fsSeen.add(q.family_id); q.pages.forEach(p => pages.add(p)); });
      if (seen.size === 400 && firstComplete === null) firstComplete = n;
      if (c.recordExposure) c.recordExposure(attempt);
      previous = new Set(attempt.map(q => q.family_id));
      if (results[n]) {
        results[n].questions += seen.size / trials;
        results[n].families += fsSeen.size / trials;
        results[n].pages += pages.size / trials;
        results[n].previousOverlap += overlap / trials;
      }
    }
    allCoveredBy.push(firstComplete);
  }
  return { trials, checkpoints: Object.fromEntries(Object.entries(results).map(([n, values]) => [n, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 100) / 100]))])), all_questions_by_attempt: allCoveredBy };
}
const rotation = {};
for (const mode of ['30', '10', 'mixed']) rotation[mode] = { before: simulate(oldCode, mode), after: simulate(code, mode) };
assert.ok(rotation['30'].after.checkpoints[10].questions > rotation['30'].before.checkpoints[10].questions);
assert.ok(rotation['10'].after.checkpoints[30].questions > rotation['10'].before.checkpoints[30].questions);
assert.ok(rotation['30'].after.all_questions_by_attempt.every(Number.isInteger));
assert.ok(rotation['10'].after.all_questions_by_attempt.every(Number.isInteger));
const fresh = context(code, new Map()), first = fresh.sampleAttempt(30); fresh.recordExposure(first);
const ledger = fresh.localStorage.getItem('tribunales-question-exposure-v1');
const reloaded = context(code, new Map([['tribunales-question-exposure-v1', ledger]]));
reloaded.readExposure();
assert.equal(vm.runInContext('state.exposure.sequence', reloaded), 1);
assert.equal(vm.runInContext('Object.keys(state.exposure.items).length', reloaded), 30);
const second = reloaded.sampleAttempt(10); assert.equal(second.filter(q => first.some(a => a.family_id === q.family_id)).length, 0);
reloaded.recordExposure(second); assert.equal(vm.runInContext('state.exposure.sequence', reloaded), 2);
for (const raw of ['bad json', '{"sequence":-1}', '{"sequence":1,"items":{"unknown":{"seen":99,"last":1}}}']) {
  const c = context(code, new Map([['tribunales-question-exposure-v1', raw]])); c.readExposure(); check(c.sampleAttempt(30), 30);
}
const blocked = context(); blocked.localStorage.getItem = blocked.localStorage.setItem = () => { throw Error('Storage blocked'); };
blocked.readExposure(); const a = blocked.sampleAttempt(30); blocked.recordExposure(a); blocked.readExposure();
assert.equal(blocked.sampleAttempt(30).filter(q => a.some(p => p.family_id === q.family_id)).length, 0);
const report = { version: bank.metadata.version, questions: 400, families: families.size, structural_questions_checked: 400, explanation_cases_checked: explanations, max_explanation_words: maxExplanationWords,
  independent_attempts_checked: 2000, sequential_attempts_checked: 8400, quick_chapter_averages: sums, quick_format_averages: formats,
  rotation, storage: { reload: 'pass', shared_10_30: 'pass', corrupt: 'pass', blocked_memory_fallback: 'pass' },
  limits: 'Simulaciones reproducibles con semilla 4272026. La cobertura es una observación, no un número garantizado de intentos para todo usuario. Se conservan cuotas temáticas y de formatos; puede haber repeticiones cuando esas cuotas lo requieran.' };
fs.writeFileSync(path.join(repo, 'VALIDACION_B400.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ questions: 400, explanations, maxExplanationWords, full30at10: rotation['30'].after.checkpoints[10], previousFull30at10: rotation['30'].before.checkpoints[10], fullAll: rotation['30'].after.all_questions_by_attempt, quickAll: rotation['10'].after.all_questions_by_attempt, storage: report.storage }, null, 2));
