const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), assert = require('assert/strict');
const repo = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(repo, 'banco_B400.json'), 'utf8'));
const baseline = JSON.parse(cp.execFileSync('git', ['-c', `safe.directory=${repo}`, 'show', '73d0997dd4f234fefb0208b4c599e6542c0ce3ca:banco_B400.json'], { cwd: repo, encoding: 'utf8', maxBuffer: 10e6 }));
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(repo, 'app.js'), 'utf8'), context);
const oldContext = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(cp.execFileSync('git', ['-c', `safe.directory=${repo}`, 'show', '73d0997dd4f234fefb0208b4c599e6542c0ce3ca:app.js'], { cwd: repo, encoding: 'utf8' }), oldContext);
for (const name of ['sampleAttempt', 'roundQuotas', 'readExposure', 'recordExposure', 'exposureOf', 'leastUsed', 'compareUse', 'addUse']) {
  assert.equal(context[name].toString(), oldContext[name].toString(), `Conservar el algoritmo: ${name}`);
}
assert.equal(bank.items.length, 400);
assert.deepEqual(bank.selection_profile, baseline.selection_profile);
let combinations = 0, falseStatements = 0, explanationCases = 0, studyPointCount = 0;
for (let index = 0; index < bank.items.length; index++) {
  const q = bank.items[index], old = baseline.items[index];
  for (const field of ['id', 'bank_id', 'chapter', 'format', 'stem', 'statements', 'options', 'key', 'answer', 'truth', 'negative', 'family_id', 'pages']) {
    assert.deepEqual(q[field], old[field], `${q.bank_id}: conservar ${field}`);
  }
  const points = context.studyPoints(q);
  assert.ok(points.length > 0, q.bank_id);
  assert.ok(points.every(p => p.label && typeof p.text === 'string' && p.text.length > 10 && !/undefined|NaN/.test(p.text)), q.bank_id);
  studyPointCount += points.length;
  if (q.truth) {
    combinations++;
    assert.equal(points.length, q.statements.length, `${q.bank_id}: explicar TODAS las afirmaciones`);
    q.truth.forEach((truth, i) => {
      assert.equal(points[i].isCorrection, !truth, q.bank_id);
      assert.match(points[i].label, truth ? /Verdadera/ : /Falsa: regla correcta/, q.bank_id);
      if (!truth) {
        falseStatements++;
        assert.equal(points[i].text, q.study_statement_notes?.[i] || q.statement_reasons[i], q.bank_id);
        assert.notEqual(points[i].text, q.statements[i], `${q.bank_id}: no enseñar como regla el texto falso`);
      }
    });
  }
  for (let selected = 0; selected < 5; selected++) {
    assert.ok(context.reviewExplanation({ question: q, selected, isCorrect: selected === q.key, isOmitted: false }).length > 20, q.bank_id);
    explanationCases++;
  }
  assert.ok(context.reviewExplanation({ question: q, selected: undefined, isCorrect: false, isOmitted: true }).length > 20, q.bank_id);
  explanationCases++;
  for (const note of q.study_notes || []) {
    assert.ok(note.text.length > 40 && note.title && note.pages.length, q.bank_id);
    assert.ok(note.pages.every(p => Number.isInteger(p) && p > 0 && p <= 118), q.bank_id);
  }
}
const example = bank.items.find(q => q.bank_id === 'B250-187');
const wrong = context.reviewExplanation({ question: example, selected: 1, isCorrect: false, isOmitted: false });
assert.match(wrong, /Falta incluir la afirmación 1/);
const allRules = context.studyPoints(example);
assert.equal(allRules.length, 4);
assert.match(allRules[0].text, /diez.*diez.*antes del vencimiento/);
assert.match(allRules[1].text, /seis días.*vencimiento del término probatorio/);
assert.match(allRules[2].text, /cuatro días/);
assert.match(allRules[3].text, /diez días.*pleito quedó concluso/);
assert.ok(example.study_notes.some(note => /sesenta días/.test(note.text)));
const negative = bank.items.find(q => q.bank_id === 'B250-012');
assert.ok(!context.studyPoints(negative)[0].text.startsWith(negative.options[negative.key]), 'No usar la clave falsa como regla verdadera');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
assert.match(html, /app.js\?v=\d{8}-[a-z0-9]+/);
assert.match(html, /\.study-explanation\{/);
assert.match(fs.readFileSync(path.join(repo, 'app.js'), 'utf8'), /banco_B400.json\?v=20261024-explicaciones/);
const report = { version: bank.metadata.version, questions: 400, combinations, false_statements: falseStatements, study_points: studyPointCount,
  explanation_cases: explanationCases, questions_and_keys_unchanged: true, sampling_profile_unchanged: true, sampling_algorithm_unchanged: true,
  user_example: 'Se explica la omisión de 1 y se enseñan los cuatro puntos, incluido el plazo correcto de seis días de la afirmación falsa 2.',
  correct_and_omitted: 'El bloque de estudio se genera a partir de la pregunta, independientemente de lo elegido.', inline_styles: true };
fs.writeFileSync(path.join(repo, 'VALIDACION_EXPLICACIONES.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
