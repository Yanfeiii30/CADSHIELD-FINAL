'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAlgorithms, loadDetectionRuntime, makeElement } = require('./support/browser-harness.cjs');

test('combined disguises recover known abuse and preserve scoring across both algorithms', async () => {
  const { VADER, NaiveBayes } = await loadAlgorithms();
  const pairs = [
    ['stup1dd', 'stupid'], ['1d0it', 'idiot'], ['m0r*n', 'moron'],
    ['1d**t', 'idiot'],
    ['st\u00ADupid', 'stupid'], ['stu\u2063pid', 'stupid'],
    ['s\u0336t\u0336u\u0336p\u0336i\u0336d\u0336', 'stupid'],
    ['st\u00fapid', 'stupid'], ['s...t...u...p...i...d', 'stupid'],
    ['k.y.s', 'kys'], ['s.t.f.u', 'stfu'], ['g.t.f.o', 'gtfo'],
    ['d1ckhead', 'dickhead'], ['sh1thead', 'shithead'],
    ['m0r0ns', 'morons'], ['a55holes', 'assholes'],
  ];
  for (const [variant, plain] of pairs) {
    assert.equal(VADER.normalizeObfuscation(variant), plain, variant);
    const input = 'You are a ' + variant;
    const expected = 'You are a ' + plain;
    assert.equal(VADER.analyze(input).aggression_score, VADER.analyze(expected).aggression_score, input);
    assert.equal(NaiveBayes.score(input), NaiveBayes.score(expected), input);
    assert.equal(VADER.analyzeWithTrace(input).aggression_score, VADER.analyze(input).aggression_score);
    assert.equal(VADER.normalizeObfuscation(VADER.normalizeObfuscation(input)), VADER.normalizeObfuscation(input));
  }
  for (const safe of ['caf\u00e9', 'r\u00e9sum\u00e9', 'cooperate', 'bookkeeper', 'good mood',
    'version 3.14', 'public class assignment', 'b****', '*****', 'cooked', 'ate', 'dead']) {
    assert.equal(VADER.normalizeObfuscation(safe), safe, safe);
  }
  assert.equal(VADER.analyze('You are not stup1dd').aggression_score, 0);
});

test('live hybrid detection covers combined disguises, acronyms and additional insults', async () => {
  const runtime = await loadDetectionRuntime({ enabled: true, mode: 'hybrid' });
  for (const input of [
    'You are stup1dd', 'You are an 1d0it', 'You are a m0r*n',
    'You are stu\u2063pid', 'k.y.s', 's.t.f.u',
    'You are a d1ckhead', 'You are a sh1thead', 'You are a dumbfuck',
    'You are all m0r0ns', 'You are all a55holes',
    'u r a worthless 1d0it',
  ]) {
    const el = makeElement();
    await runtime.analyzeElement(el, input);
    assert.equal(el.getAttribute('data-cad'), 'aggressive', input);
  }
  for (const input of ['You are not stup1dd', 'Thank you for your wonderful help',
    'You killed it out there! Destroyed the opposition!', 'I cooked dinner',
    'The battery is dead', 'This is a public class assignment', 'u r amazing']) {
    const el = makeElement();
    await runtime.analyzeElement(el, input);
    assert.equal(el.getAttribute('data-cad'), 'safe', input);
  }
});

test('known abusive variants normalize without changing surrounding context', async () => {
  const { VADER } = await loadAlgorithms();
  for (const [input, expected] of [
    ['you are stup1d', 'you are stupid'],
    ['you are an 1d10t', 'you are an idiot'],
    ['you are stuuupid', 'you are stupid'],
    ['you are an i d i o t', 'you are an idiot'],
    ['you are an i.d.i.o.t', 'you are an idiot'],
    ['you are st\u200Bupid'.replace('\\u200B', '\u200B'), 'you are stupid'],
    ['you are ｓｔｕｐｉｄ', 'you are stupid'],
    ['you are stupіd', 'you are stupid'],
    ['you are not stup1d', 'you are not stupid'],
    ['you are STUP1D', 'you are STUPID'],
  ]) assert.equal(VADER.normalizeObfuscation(input), expected, input);
  for (const safe of ['class assignment', 'classic artwork', 'Scunthorpe', 'version 3.14', 'a good book', 'I will assist you']) {
    assert.equal(VADER.normalizeObfuscation(safe), safe);
  }
});

test('normalization preserves contextual scoring and live detection recognizes disguised abuse', async () => {
  const { VADER, NaiveBayes } = await loadAlgorithms();
  for (const [disguised, plain] of [
    ['you are not stup1d', 'you are not stupid'],
    ['that is fucking beautiful', 'that is fucking beautiful'],
    ['you are a worthless 1d10t', 'you are a worthless idiot'],
  ]) {
    assert.equal(VADER.analyze(disguised).aggression_score, VADER.analyze(plain).aggression_score);
    assert.equal(NaiveBayes.score(disguised), NaiveBayes.score(plain));
    assert.equal(VADER.analyzeWithTrace(disguised).aggression_score, VADER.analyze(disguised).aggression_score);
  }
  const runtime = await loadDetectionRuntime({ enabled: true, mode: 'hybrid' });
  for (const input of ['you are a worthless 1d10t', 'you are a stuuupid moron', 'you are an i.d.i.o.t']) {
    const el = makeElement();
    await runtime.analyzeElement(el, input);
    assert.equal(el.getAttribute('data-cad'), 'aggressive', input);
  }
});


test('inserted punctuation and readable typos recover known insults without guessing ordinary words', async () => {
  const { VADER, NaiveBayes } = await loadAlgorithms();
  for (const [variant, plain] of [
    ['stu[pid', 'stupid'], ['stu(pid', 'stupid'], ['stu/pid', 'stupid'],
    ['stu*pid', 'stupid'], ['stu{pid', 'stupid'],
    ['sutpid', 'stupid'], ['stpuid', 'stupid'], ['stpid', 'stupid'],
    ['idoit', 'idiot'], ['worhtless', 'worthless'], ['pathethic', 'pathetic'],
    ['asshloe', 'asshole'], ['disgusitng', 'disgusting'],
  ]) {
    assert.equal(VADER.normalizeObfuscation(variant), plain, variant);
    const text = 'You are a ' + variant;
    const expected = 'You are a ' + plain;
    assert.equal(VADER.analyze(text).aggression_score, VADER.analyze(expected).aggression_score);
    assert.equal(NaiveBayes.score(text), NaiveBayes.score(expected));
  }
  for (const safe of ['wore', 'shirt', 'shot', 'duck', 'wordless', 'moral', 'class', 'assignment', 'stupdiology']) {
    assert.equal(VADER.normalizeObfuscation(safe), safe, safe);
  }
  assert.equal(VADER.normalizeObfuscation('You are not an idoit'), 'You are not an idiot');
  assert.equal(VADER.normalizeObfuscation('SUTPID'), 'STUPID');
  const runtime = await loadDetectionRuntime({ enabled: true, mode: 'hybrid' });
  for (const text of ['you are stu[pid', 'you are a worthless idoit', 'you are a sutpid moron']) {
    const el = makeElement();
    await runtime.analyzeElement(el, text);
    assert.equal(el.getAttribute('data-cad'), 'aggressive', text);
  }
});


test('lexicon-derived recovery handles masks, transpositions, and missing vowels beyond listed examples', async () => {
  const { VADER } = await loadAlgorithms();
  for (const [input, expected] of [
    ['stpd', 'stupid'], ['bithc', 'bitch'], ['b***h', 'bitch'], ['id**t', 'idiot'],
    ['wrthlss', 'worthless'], ['dsgstng', 'disgusting'], ['patheti c', 'pathetic'],
    ['cwoard', 'coward'], ['m*r*n', 'moron'], ['l#ser', 'loser'],
  ]) assert.equal(VADER.normalizeObfuscation(input), expected, input);
  for (const safe of ['wore', 'shirt', 'count', 'public', 'moral', 'wordless', 'b****', '*****', 'abcxyz']) {
    assert.equal(VADER.normalizeObfuscation(safe), safe, safe);
  }
  const r = await loadDetectionRuntime({ enabled: true, mode: 'hybrid' });
  for (const text of ['You are stpd.', 'You are a b***h.', 'You are an id**t.', 'You are a bithc.', 'You are a cwoard.']) {
    const el = makeElement(); await r.analyzeElement(el, text);
    assert.equal(el.getAttribute('data-cad'), 'aggressive', text);
  }
});
