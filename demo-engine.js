/* Собрано: python3 smartcards-android/tools/build_web.py --demo. Не править руками: движок — smartcards-ios/tools/understanding/engine.js, правила — smartcards-ios/tools/understanding/demo/. */
/* Проверка ответов «Вспоминалки» — порт AnswerEngine.swift для веб-тренажёра, Android и демо.
 *
 * Источник правды — Swift (SmartCards/Sources/AnswerEngine.swift): здесь всё повторяет его шаг в шаг,
 * включая числа и порядок обхода. Расхождение с Swift — это ложный зачёт или ложный отказ у ребёнка,
 * поэтому tools/tests/js/diff.js прогоняет оба движка по одним и тем же ответам и сверяет вердикты.
 *
 * Подключение: <script src="engine.js"> или вставка текстом в страницу (build_web.py) — тогда
 * в глобальной области появляется `SmartCardsAnswers`; в Node — module.exports.
 *   SmartCardsAnswers.install(rulesJson)          — правила (understanding.json)
 *   SmartCardsAnswers.checkWord(input, card)      — 'exact' | 'almost' | 'inside' | false
 *   SmartCardsAnswers.review(input, card, prev)   — { accepted, vetoed, question }
 *   SmartCardsAnswers.fingerprint(q, a)           — отпечаток карточки (как на сервере)
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- слова и основы */

  const norm = s => {
    let out = '';
    let gap = false;
    for (const ch of String(s == null ? '' : s).toLowerCase()) {
      const c = ch === 'ё' ? 'е' : ch;
      const v = c.codePointAt(0);
      const keep = (v >= 0x30 && v <= 0x39) || (v >= 0x61 && v <= 0x7a) || (v >= 0x430 && v <= 0x44f) || v === 0x2d;
      if (keep) {
        if (gap && out.length) out += ' ';
        gap = false;
        out += c;
      } else gap = true;
    }
    return out;
  };

  const splitWords = s => s.split(/[ -]/).filter(w => w.length > 0);

  const STOP = new Set(`и а но да или же ли бы б не ни в во на за над под из изо от ото до по о об обо
    про для к ко с со у при через сквозь между ради вокруг около перед пред без вместо кроме
    что чтобы как так тот та то те этот эта это эти там тут здесь вот ведь уже еще ещё только лишь
    очень просто даже потому потомучто затем зато итак когда где куда откуда почему зачем
    я ты он она оно мы вы они его ее её их им ими нас вас мне тебе ему ей нам вам них
    мой моя мое моё мои твой свой свои себя себе сам сама само сами
    быть был была было были есть нет весь вся все всё всех
    который которая которое которые кто кого чей
    итак`.split(/\s+/).filter(Boolean));

  const ENDINGS = [
    'ившись', 'ывшись', 'авшись', 'ующий', 'ающий', 'ившие', 'ывшие', 'ались', 'ились',
    'ыми', 'ими', 'ого', 'его',
    'ому', 'ему', 'ала', 'яла', 'ила', 'ыла', 'ела', 'ало', 'яло', 'ило', 'ыло', 'ело',
    'али', 'яли', 'или', 'ыли', 'ели',
    'ешь', 'ишь', 'ете', 'ите', 'ают', 'яют', 'уют', 'ует', 'ает', 'ить', 'ать', 'еть',
    'ять', 'ыть', 'ями', 'ами', 'иями',
    'ией', 'иям', 'ием', 'иях', 'ах', 'ях', 'ов', 'ев', 'ых', 'их', 'ая', 'яя', 'ое', 'ее',
    'ые', 'ие', 'ый', 'ий', 'ой', 'ей',
    'ую', 'юю', 'ым', 'им', 'ом', 'ем', 'ут', 'ют', 'ат', 'ят', 'ит', 'ет', 'ил', 'ыл',
    'ал', 'ял', 'ел', 'ла', 'ло', 'ли', 'ть', 'ти',
    'ья', 'ье', 'ью', 'ия', 'ии', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'л', 'й'
  ].map((text, i) => ({ text, i })).sort((l, r) => r.text.length - l.text.length || l.i - r.i).map(e => e.text);

  const stem = w => {
    let s = String(w).toLowerCase().replace(/ё/g, 'е');
    if (s.length <= 3) return s;
    if (s.endsWith('ся') || s.endsWith('сь')) s = s.slice(0, -2);
    const n = s.length;
    for (const e of ENDINGS) if (n - e.length >= 3 && s.endsWith(e)) return s.slice(0, -e.length);
    return s;
  };

  const meaningful = t => splitWords(norm(t)).filter(w => w.length > 1 && !STOP.has(w));
  const forms = w => [w, stem(w)];
  const sameWord = (a, b) => {
    if (a === b) return true;
    const fb = forms(b);
    return forms(a).some(x => fb.includes(x));
  };

  const lev = (a, b) => {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 1) return 2;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };

  const hasDigit = s => /\p{N}/u.test(s);

  const fingerprint = (q, a) => {
    let h = 2166136261;
    for (const ch of q + '|' + a) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };

  /* ---------------------------------------------------------------- карточки-слова */

  const DOUBT = new Set(['не', 'нет', 'ни', 'без', 'или', 'либо', 'и', 'а', 'но', 'никогда', 'нельзя']);

  /** Верное слово стоит в ответе целиком, возможно в другой форме, лишних слов немного. */
  function isInside(input, target) {
    const words = splitWords(input), goal = splitWords(target);
    if (!goal.length || words.length < goal.length || words.length > goal.length + 3) return false;
    for (let start = 0; start <= words.length - goal.length; start++) {
      let all = true;
      for (let k = 0; k < goal.length; k++) if (!sameWord(words[start + k], goal[k])) { all = false; break; }
      if (!all) continue;
      const extra = words.slice(0, start).concat(words.slice(start + goal.length));
      if (extra.some(w => DOUBT.has(w))) continue;
      return true;
    }
    return false;
  }

  // Keep numeric notation distinct: a fraction is not a decimal or a pair of integers.
  function numericKey(input) {
    let value = input.trim().replace(/−/g, '-').replace(/,/g, '.');
    if (!/^[+-]?[0-9]+(?:\.[0-9]+|\s*\/\s*[0-9]+)?$/.test(value)) return null;
    const negative = value.startsWith('-');
    value = value.replace(/^[+-]/, '');
    const integer = text => text.replace(/^0+/, '') || '0';
    if (value.includes('/')) {
      const parts = value.split('/').map(p => integer(p.trim()));
      if (parts[1] === '0') return null;
      return (negative && parts[0] !== '0' ? '-' : '') + parts.join('/');
    }
    const parts = value.split('.');
    const whole = integer(parts[0]), fraction = (parts[1] || '').replace(/0+$/, '');
    return (negative && (whole !== '0' || fraction) ? '-' : '') + whole + (fraction ? '.' + fraction : '');
  }

  /** 'exact' | 'almost' (описка в одну букву) | 'inside' (слово внутри фразы) | false */
  function checkWord(input, card) {
    if (numericKey(card.a) !== null) {
      const value = numericKey(input), alternatives = card.alt || [];
      if (value !== null && [card.a].concat(alternatives).some(t => numericKey(t) === value)) return 'exact';
      if (alternatives.some(t => numericKey(t) === null && norm(t) === norm(input))) return 'exact';
      return false;
    }
    const v = norm(input);
    if (!v) return false;
    const targets = [card.a].concat(card.alt || []).map(norm);
    if (targets.includes(v)) return 'exact';
    if (card.strict || hasDigit(v) || targets.some(hasDigit)) return false;
    if (targets.some(t => isInside(v, t))) return 'inside';
    if (targets.some(t => t.length >= 6 && lev([...v], [...t]) <= 1)) return 'almost';
    return false;
  }

  /* ---------------------------------------------------------------- синонимы (запасной разбор) */

  const SYNONYM_GROUPS = [
    'лай лаять залаять лаяла гавкать гавкнуть гавк тявкать брехать',
    'собака пес псина',
    'испуг испугаться испуганный страх бояться боязнь пугаться ужас',
    'рассердиться сердиться разозлиться злиться гнев злость раздражение возмутиться рассердилась',
    'покой тишина спокойствие',
    'плакать заплакать рыдать слеза слезы',
    'жалость жалеть сострадание сочувствие',
    'любовь любить привязанность привязаться привязанный',
    'грусть печаль тоска горе',
    'радость счастье',
    'смелость храбрость отвага мужество',
    'обман лгать врать ложь',
    'убежать сбежать удрать',
    'утопить потопить утопление',
    'каприз прихоть блажь самодурство',
    'приказать велеть потребовать распорядиться',
    'бедный нищий бедность нищета'
  ].map(g => new Set(g.split(' ').flatMap(w => forms(norm(w)))));

  /* ---------------------------------------------------------------- запись правила */

  const NEGATORS = new Set(['не', 'ни', 'нет', 'без', 'никогда', 'нельзя', 'никто', 'ничего', 'нигде', 'никак',
    'никуда', 'никакой', 'никакая', 'никакие', 'никакого', 'ничей']);
  const SOFT_AFTER_NOT = new Set(['только', 'просто', 'раз', 'зря', 'столько']);
  const CLAUSE_BREAKERS = new Set(['но', 'а', 'зато', 'однако', 'хотя']);
  const STRONG = new Set([';', ':', '!', '?', '…', '\n', '\r']);
  const MAX_GAP = 2;
  const NEGATION_WINDOW = 4;
  /* Союз между двумя «не» («не шуметь и не мусорить»): отрицание слева от него относится к первому глаголу. */
  const COORDINATORS = new Set(['и', 'или', 'либо']);
  const MODAL = new Set(['нужно', 'надо', 'следует', 'стоит', 'можно', 'должен', 'должна', 'должны']);

  /** Запись из файла правил. null — запись не разобрана. */
  function parsePattern(raw) {
    let text = raw.trim();
    let explicit = null, cross = false;
    if (text.startsWith('^')) { cross = true; text = text.slice(1); }
    if (text.startsWith('!')) { explicit = 'negated'; text = text.slice(1); }
    else if (text.startsWith('~')) { explicit = 'any'; text = text.slice(1); }
    const sequences = [];
    let literal = false;
    for (const part of text.split('+').filter(p => p.length > 0)) {
      const seq = [];
      for (const slot of part.replace(/-/g, ' ').split(' ').filter(s => s.length > 0)) {
        const position = [];
        for (const alt of slot.split('/').filter(s => s.length > 0)) {
          let word = alt, prefix = false;
          if (word.endsWith('*')) { prefix = true; word = word.slice(0, -1); }
          const n = norm(word);
          if (!n || n.includes(' ')) return null;
          if (NEGATORS.has(n)) literal = true;
          position.push({ prefix, text: n });
        }
        if (!position.length) return null;
        seq.push(position);
      }
      if (!seq.length) return null;
      sequences.push(seq);
    }
    if (!sequences.length) return null;
    return {
      raw, sequences, crossParts: cross,
      size: sequences.reduce((s, q) => s + q.length, 0),
      polarity: explicit || (literal ? 'any' : 'positive')
    };
  }

  /** Запись запасного разбора: ключевое слово с любым окончанием и синонимами. */
  function keyPattern(key, polarity) {
    const keyForms = new Set(forms(key));
    const synonyms = [];
    SYNONYM_GROUPS.forEach((g, i) => { if ([...g].some(f => keyForms.has(f))) synonyms.push(i); });
    return { raw: key, sequences: [[[{ stem: true, forms: keyForms, synonyms }]]], size: 1, crossParts: false, polarity };
  }

  let rules = {};
  let loadProblems = [];

  function install(file) {
    const data = typeof file === 'string' ? JSON.parse(file) : file;
    loadProblems = [];
    rules = {};
    for (const [id, entry] of Object.entries(data.cards || {})) {
      const groups = [];
      for (const group of entry.ok) {
        const patterns = [];
        for (const raw of group) {
          const p = parsePattern(raw);
          if (p) patterns.push(p); else loadProblems.push(id + ': «' + raw + '»');
        }
        if (patterns.length) groups.push(patterns);
      }
      const bad = [];
      for (const raw of entry.bad || []) {
        const p = parsePattern(raw);
        if (p) bad.push(p); else loadProblems.push(id + ': «' + raw + '»');
      }
      if (!groups.length) { loadProblems.push(id + ': нет ни одной идеи'); continue; }
      rules[id] = {
        fingerprint: entry.fp, ask: entry.ask,
        need: Math.max(1, Math.min(entry.need || 1, groups.length)),
        groups, bad, authored: true, soft: !!entry.soft,
        exact: new Set((entry.exact || []).map(exactKey).filter(Boolean))
      };
    }
    fallbackCache = {};
    return rules;
  }

  const GENERIC_ASK = 'Скажи ещё немного своими словами — посмотри на подсказку.';

  /* ---------------------------------------------------------------- фразы */

  /** «Нет он испугался»: «нет» в начале фразы перед этими словами — ответ «нет», а не отрицание. */
  const AFTER_INTERJECTION = new Set(['он', 'она', 'оно', 'они', 'я', 'мы', 'ты', 'вы', 'это', 'потому', 'так', 'конечно', 'наоборот',
    'ведь', 'просто', 'не', 'там', 'тут', 'тогда', 'совсем']);
  /** «Запятая перед а и но», «союз но», «на а»: «а» и «но» — названные слова, а не граница мысли. */
  const MENTION_BEFORE = new Set(['перед', 'после', 'союз', 'союза', 'союзом', 'союзы', 'союзов', 'буква', 'буквы', 'букву', 'буквой',
    'на', 'и', 'или', 'слово', 'слова', 'частица', 'окончание', 'окончания', 'звук', 'звука']);

  /** Сокращения из тетради: точка внутри них не конец фразы, а правилам нужно слово целиком. */
  const ABBREVIATIONS = [
    ['и\\s?т\\.\\s?п\\.?', 'и тому подобное'], ['и\\s?т\\.\\s?д\\.?', 'и так далее'],
    ['ж\\.\\s?р\\.?', 'женский род'], ['м\\.\\s?р\\.?', 'мужской род'], ['ср\\.\\s?р\\.?', 'средний род'],
    ['мн\\.\\s?ч\\.?', 'множественное число'], ['ед\\.\\s?ч\\.?', 'единственное число'],
    ['и\\.\\s?п\\.?', 'именительный падеж'], ['р\\.\\s?п\\.?', 'родительный падеж'],
    ['д\\.\\s?п\\.?', 'дательный падеж'], ['в\\.\\s?п\\.?', 'винительный падеж'],
    ['т\\.\\s?п\\.?', 'творительный падеж'], ['п\\.\\s?п\\.?', 'предложный падеж'],
    ['т\\.\\s?е\\.?', 'то есть'], ['т\\.\\s?к\\.?', 'так как'], ['т\\.\\s?д\\.?', 'так далее']
  ].map(([pattern, words]) => [new RegExp('(^|[^а-яёa-z0-9])' + pattern + '(?![а-яё])', 'g'), '$1 ' + words + ' ']);

  /** Знаки действий — словами; тире — действие, только если с обеих сторон число или одна буква,
   *  двоеточие — если справа число или буква, а слева тоже или пробел. */
  function spellOperators(text) {
    const chars = [...text];
    const isOperandChar = c => /[\p{L}\p{N}]/u.test(c);
    const operand = (i, step) => {
      let j = i + step;
      while (j >= 0 && j < chars.length && chars[j] === ' ') j += step;
      let run = 0, digits = true;
      while (j >= 0 && j < chars.length && isOperandChar(chars[j])) {
        if (!(chars[j] >= '0' && chars[j] <= '9')) digits = false;
        run++; j += step;
      }
      return run > 0 && (run === 1 || digits);
    };
    let out = '';
    chars.forEach((c, i) => {
      const between = () => operand(i, -1) && operand(i, 1);
      if ('×·∙⋅*'.includes(c)) out += ' умножить ';
      else if (c === '÷') out += ' разделить ';
      else if (c === '+') out += ' плюс ';
      else if (c === '=') out += ' равно ';
      else if (c === '%') out += ' процент ';
      else if (c === '<') out += ' меньше ';
      else if (c === '>') out += ' больше ';
      else if (c === '−') out += ' минус ';
      // Пробел перед двоеточием бывает только в записи действия («число : 100»), в тексте — «Ответ: 5».
      else if (c === ':' && operand(i, 1) && (operand(i, -1) || i === 0 || chars[i - 1] === ' ')) out += ' разделить ';
      else if ('-–—'.includes(c) && between()) out += ' минус ';
      else out += c;
    });
    return out;
  }

  /** Ответ перед разбором: сокращения раскрыты, знаки действий записаны словами. */
  function prepare(text) {
    let s = String(text == null ? '' : text).toLowerCase();
    for (const [regex, template] of ABBREVIATIONS) s = s.replace(regex, template);
    return spellOperators(s);
  }

  /** Ответ, разрешённый правилом целиком, сравнивается со знаками действий. */
  const exactKey = text => norm(prepare(text));

  /** «а» или «но» названы как слово: после «перед», «союз», «на»…, в паре «а и но» или в самом конце фразы. */
  function isMention(words, k) {
    const w = words[k].word;
    if (w !== 'а' && w !== 'но') return false;
    if (k === words.length - 1) return k > 0;
    if (k > 0 && MENTION_BEFORE.has(words[k - 1].word)) return true;
    if (k + 2 < words.length && COORDINATORS.has(words[k + 1].word) && (words[k + 2].word === 'а' || words[k + 2].word === 'но')) return true;
    return false;
  }

  /** «а», «но» в кавычках («а», «но») и с дефисом (-а) — разговор о слове, а не граница мысли. */
  function protectBreakers(part) {
    const chars = [...part.toLowerCase()];
    const isWordChar = c => /[\p{L}\p{N}]/u.test(c);
    let out = '';
    let i = 0;
    while (i < chars.length) {
      const c = chars[i];
      let consumed = 0;
      if ('«“„"'.includes(c) || (c === '-' && (i === 0 || !isWordChar(chars[i - 1])))) {
        let j = i + 1, word = '';
        while (j < chars.length && isWordChar(chars[j])) { word += chars[j]; j++; }
        const quoted = c !== '-';
        if (CLAUSE_BREAKERS.has(word) && (!quoted || (j < chars.length && '»”“"'.includes(chars[j])))) {
          out += ' q' + word + ' ';
          consumed = j - i + (quoted ? 1 : 0);
        }
      }
      if (consumed > 0) i += consumed; else { out += c; i += 1; }
    }
    return out;
  }

  /** Ответ → фразы из слов; каждое слово несёт номер части между запятыми. */
  function clauses(text) {
    const chars = [...prepare(text)];
    const isDigit = c => c >= '0' && c <= '9';
    const neighbour = (i, step) => {
      let j = i + step;
      while (j >= 0 && j < chars.length) { if (chars[j] !== ' ') return chars[j]; j += step; }
      return null;
    };
    const strong = [];
    let parts = [], current = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ',' || ch === '.') {
        const decimal = i > 0 && i + 1 < chars.length && isDigit(chars[i - 1]) && isDigit(chars[i + 1]);
        const l = neighbour(i, -1), r = neighbour(i, 1);
        const list = ch === ',' && l !== null && isDigit(l) && r !== null && isDigit(r);
        if (decimal || list) { current += ' '; continue; }
        if (ch === ',') { parts.push(current); current = ''; continue; }
        parts.push(current); current = '';
        strong.push(parts); parts = [];
      } else if (STRONG.has(ch)) {
        parts.push(current); current = '';
        strong.push(parts); parts = [];
      } else current += ch;
    }
    parts.push(current);
    strong.push(parts);

    const result = [];
    for (const phrase of strong) {
      const words = [];
      phrase.forEach((part, partIndex) => {
        for (const w of splitWords(norm(protectBreakers(part)))) words.push({ word: w, part: partIndex });
      });
      let tokens = [];
      words.forEach((item, k) => {
        const w = item.word;
        if (w.startsWith('q') && CLAUSE_BREAKERS.has(w.slice(1))) tokens.push({ word: w.slice(1), part: item.part });
        else if (CLAUSE_BREAKERS.has(w) && !isMention(words, k)) { if (tokens.length) result.push(tokens); tokens = []; }
        else tokens.push(item);
      });
      if (tokens.length) result.push(tokens);
    }
    return result;
  }

  /* ---------------------------------------------------------------- сопоставление */

  const makeToken = (text, part) => ({ text, part: part || 0, forms: new Set(forms(text)) });

  const matches = (position, token) => position.some(term => {
    if (term.stem) {
      for (const f of token.forms) if (term.forms.has(f)) return true;
      return term.synonyms.some(i => [...token.forms].some(f => SYNONYM_GROUPS[i].has(f)));
    }
    return term.prefix ? token.text.startsWith(term.text) : token.text === term.text;
  });

  function occurrences(seq, tokens, crossParts) {
    const found = [];
    for (let s = 0; s < tokens.length; s++) {
      if (!matches(seq[0], tokens[s])) continue;
      let last = s, ok = true;
      const matched = [s];
      for (let p = 1; p < seq.length; p++) {
        let at = -1, j = last + 1;
        while (j < tokens.length && j <= last + 1 + MAX_GAP && (crossParts || tokens[j].part === tokens[s].part)) {
          if (matches(seq[p], tokens[j])) { at = j; break; }
          j++;
        }
        if (at < 0) { ok = false; break; }
        last = at;
        matched.push(at);
      }
      if (ok) found.push({ start: s, end: last, matched });
    }
    return found;
  }

  /** Отрицание перед местом и внутри него. «Не мог не» — двойное, значит утверждение. */
  function isNegated(tokens, o, consumed) {
    consumed = consumed || new Set();
    let particles = 0, others = 0;
    let i = Math.max(0, o.start - NEGATION_WINDOW);
    const part = tokens[o.start].part;
    while (i <= o.end) {
      const inside = i >= o.start && i <= o.end;
      // «Не шуметь и не мусорить»: два «не» по обе стороны от «и» друг друга не отменяют — счёт начинается заново.
      if (i < o.start && tokens[i].part === part && COORDINATORS.has(tokens[i].text)) { particles = 0; others = 0; i++; continue; }
      if (!inside && (consumed.has(i) || tokens[i].part !== part)) { i++; continue; }
      const t = tokens[i].text;
      if (t === 'не') {
        if (i + 1 < tokens.length && SOFT_AFTER_NOT.has(tokens[i + 1].text)) { i++; continue; }
        particles++;
      } else if (NEGATORS.has(t)) {
        if (t === 'нет' && i === 0 && tokens.length > 1 && tokens[1].part === tokens[0].part &&
            AFTER_INTERJECTION.has(tokens[1].text)) { i++; continue; }
        others++;
      }
      i++;
    }
    if (particles % 2 === 1 || (particles === 0 && others > 0)) return true;
    // «Нельзя рвать цветы и трогать птенцов»: «нельзя» (и «не нужно», «не надо») действует и на второй глагол.
    const w = tokens[o.start].text;
    if (particles === 0 && others === 0 && o.start >= 2 && (tokens[o.start - 1].text === 'и' || tokens[o.start - 1].text === 'или') &&
        (w.endsWith('ть') || w.endsWith('ти') || w.endsWith('чь'))) {
      let k = o.start - 2;
      const floor = Math.max(0, o.start - 9);
      while (k >= floor && tokens[k].part === part) {
        if (consumed.has(k)) { k--; continue; }
        const t = tokens[k].text;
        if (t === 'нельзя') return true;
        if (t === 'не' && k + 1 < tokens.length && MODAL.has(tokens[k + 1].text)) return true;
        k--;
      }
    }
    return false;
  }

  /** Окончания, с которыми короткая основа остаётся тем же словом: «час» — «часа», «кот» — «кота». */
  const SHORT_STEM_ENDINGS = new Set(['', 'а', 'у', 'е', 'ом', 'ем', 'ы', 'и', 'ов', 'ам', 'ами', 'ах', 'ю', 'я']);

  /** Слово ответа — то же, что слово вопроса: та же форма, общая основа от четырёх букв или короткая
   *  основа с падежным окончанием. «Часть» и «часа», «как» и «какой» — разные слова. */
  function repeats(t, q) {
    if (t.text === q.word) return true;
    for (const f of q.forms) {
      if (!t.forms.has(f)) continue;
      if ([...f].length >= 4) return true;
      if (t.text.startsWith(f) && q.word.startsWith(f) &&
          SHORT_STEM_ENDINGS.has(t.text.slice(f.length)) && SHORT_STEM_ENDINGS.has(q.word.slice(f.length))) return true;
    }
    return false;
  }

  /** Слово ответа ничего не добавляет к вопросу, если оно из вопроса. */
  function isNovel(t, question, questionForms) {
    if (NEGATORS.has(t.text)) return !question.has(t.text);
    if (hasDigit(t.text)) return !question.has(t.text);
    return !questionForms.some(q => repeats(t, q));
  }

  const wordForms = question => [...question].sort().map(word => ({ word, forms: forms(word) }));

  function scan(tokens, rule, question, questionForms, e) {
    const singles = [], conjunctions = [];
    let order = 0;
    const collect = (p, group) => {
      order++;
      if (p.sequences.length > 1) conjunctions.push([p, group]);
      else for (const o of occurrences(p.sequences[0], tokens, p.crossParts))
        singles.push({ pattern: p, group, occurrence: o, order });
    };
    rule.groups.forEach((patterns, g) => patterns.forEach(p => collect(p, g)));
    rule.bad.forEach(p => collect(p, null));

    singles.sort((a, b) => {
      if (a.pattern.size !== b.pattern.size) return b.pattern.size - a.pattern.size;
      if ((a.group === null) !== (b.group === null)) return a.group === null ? -1 : 1;
      if (a.occurrence.start !== b.occurrence.start) return a.occurrence.start - b.occurrence.start;
      return a.order - b.order;
    });

    const covered = new Set();
    const judge = (p, group, negated, novel) => {
      if (group !== null) {
        if (p.polarity === 'any') { if (novel) e.hits.add(group); }
        else if (p.polarity === 'positive') {
          if (negated) { if (!rule.soft) e.vetoed = true; } else if (novel) e.hits.add(group);
        } else {
          if (negated) { if (novel) e.hits.add(group); } else e.vetoed = true;
        }
      } else if (!negated || p.polarity === 'any') e.vetoed = true;
    };
    for (const c of singles) {
      if (covered.has(c.occurrence.start)) continue;
      const before = new Set(covered);
      for (let i = c.occurrence.start; i <= c.occurrence.end; i++) covered.add(i);
      const negated = c.pattern.polarity === 'any' ? false : isNegated(tokens, c.occurrence, before);
      const novel = c.occurrence.matched.some(m => isNovel(tokens[m], question, questionForms));
      judge(c.pattern, c.group, negated, novel);
    }
    for (const [p, group] of conjunctions) {
      const chosen = [];
      let complete = true;
      for (const seq of p.sequences) {
        const occs = occurrences(seq, tokens, p.crossParts).filter(o => !covered.has(o.start));
        if (!occs.length) { complete = false; break; }
        const want = p.polarity === 'negated';
        chosen.push(occs.find(o => isNegated(tokens, o, covered) === want) || occs[0]);
      }
      if (!complete) continue;
      const negated = p.polarity === 'any' ? false : chosen.some(o => isNegated(tokens, o, covered));
      const novel = chosen.some(o => o.matched.some(m => isNovel(tokens[m], question, questionForms)));
      judge(p, group, negated, novel);
    }
  }

  function evaluate(text, rule, questionText) {
    const e = { hits: new Set(), vetoed: false };
    const words = meaningful(text);
    const own = new Set(splitWords(norm(text)));
    const inQuestion = new Set(splitWords(norm(prepare(questionText))));
    const numbers = [...own].filter(hasDigit);
    if (!words.length && !numbers.length && !own.size) return e;
    const asked = meaningful(questionText);
    if (!rule.authored && words.length && words.every(w => asked.some(q => sameWord(w, q))) &&
        [...own].every(w => !NEGATORS.has(w) || inQuestion.has(w)) && numbers.every(n => inQuestion.has(n))) return e;
    const questionForms = wordForms(inQuestion);
    for (const tokens of clauses(text)) scan(tokens.map(t => makeToken(t.word, t.part)), rule, inQuestion, questionForms, e);
    return e;
  }

  /* ---------------------------------------------------------------- запасной разбор */

  const WEAK_KEYS = new Set(`много мало просто основном примерно можно нужно также после перед потому поэтому всегда иногда
    каждый каждая каждое разные разный другой другие является называют называется например значит
    чтобы тоже очень более менее самый самая самое один одна одно одни этого этом такой такая такие
    которых котором которой которого которому которую какой какая какие какое попало`.split(/\s+/).filter(Boolean));

  let fallbackCache = {};

  function fallback(card) {
    const fp = fingerprint(card.q, card.a);
    const cacheKey = card.id + '|' + fp;
    if (fallbackCache[cacheKey]) return fallbackCache[cacheKey];
    const answerClauses = clauses(card.a).map(c => c.map(t => makeToken(t.word, t.part)));
    const seen = new Set();
    const groups = [];
    for (const raw of (card.keywords || []).concat(meaningful(card.a))) {
      const key = norm(raw);
      if (key.length <= 1 || key.includes(' ') || WEAK_KEYS.has(key)) continue;
      const st = stem(key);
      if (seen.has(st)) continue;
      seen.add(st);
      const probe = keyPattern(key, 'positive');
      const states = [];
      for (const tokens of answerClauses)
        tokens.forEach((t, i) => { if (matches(probe.sequences[0][0], t)) states.push(isNegated(tokens, { start: i, end: i, matched: [i] })); });
      const polarity = states.length && states.every(Boolean) ? 'negated' : 'positive';
      groups.push([keyPattern(key, polarity)]);
    }
    const rule = { fingerprint: fp, ask: GENERIC_ASK, need: 1, groups, bad: [], authored: false, soft: false, exact: new Set() };
    fallbackCache[cacheKey] = rule;
    return rule;
  }

  /* ---------------------------------------------------------------- вердикт */

  /** previous — прежние ответы ребёнка на эту же карточку: две неполные части складываются в мысль,
   *  но ответ, перечёркивающий мысль, в сумму не входит. */
  function review(input, card, previous) {
    const own = card.type === 'image' ? rules[card.id] : null;
    const rule = own && own.fingerprint === fingerprint(card.q, card.a) ? own : fallback(card);
    const clarify = { accepted: false, vetoed: false, question: rule.ask };
    const current = norm(input);
    if (!current) return clarify;
    const yes = { accepted: true, vetoed: false, question: rule.ask };
    if (current === norm(card.a) || rule.exact.has(exactKey(input))) return yes;
    const now = evaluate(input, rule, card.q);
    if (now.vetoed) return { accepted: false, vetoed: true, question: rule.ask };
    if (now.hits.size >= rule.need) return yes;
    if (previous && norm(previous)) {
      const both = evaluate(previous + ' ' + input, rule, card.q);
      if (!both.vetoed && both.hits.size >= rule.need) return yes;
    }
    return clarify;
  }

  const api = {
    install, review, checkWord, fingerprint, norm, stem, meaningful, clauses, prepare, isInside, lev,
    get loadProblems() { return loadProblems; },
    get rules() { return rules; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SmartCardsAnswers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

SmartCardsAnswers.install({"cards":{"demo-i1":{"ask":"Какой была жизнь Герасима до Муму и что хорошего они дали друг другу?","bad":["много друзей","друзей много","полно друзей","куча друзей","друзей хватало","один из","одна из","ненавид*","ненавидел*","ненавидит*","боялся её","бил её","мучил её","злая собака"],"fp":"1xuvnn8","need":1,"ok":[["одинок*","одиночеств*","был/жил/остался/оставался/чувствовал*/было один/одна/одиноко","никого не было","не было никого","ни друзей","не было друзей/друга/близких/семьи/родных","никто не любил*","никому не нужен","без друзей/семьи/близких/родных","не хватало друг*/друз*/общения/любви/ласки/тепла","некого любить","нуждал* в друг*/любви/ласке/заботе","нужен был друг","нужна была дружба","хотел друга/любви"],["спас/спасл*/спасал*/спасен*/спасти","вытащил*","достал* из воды","выручил*","не дал/дала/дали утонуть","выходил*","выхажива*","ухажива*","лечил*","вылечил*","выкормил*","подобрал*","приютил*","пригрел*","взял* к себе"],["заботил*","заботу","кормил*","накормил*","оберега*","берёг*/берег*","защищал*","охранял*","не давал* в обиду"],["любил*","любит*","любов*","любви","любим*","полюбил*","полюбила","полюбить","предан*","верный/верная/верной/верность/верностью/верен","привязан* к нему","привязана к нему","радовал*","радовалась","радость/радости","ласков*","ласкал*","понимал*","утешал*","утешение"],["друг/друга/другу/другом/друзья/друзей/друзьями","друж*","подруж*","друз*","товарищ*","приятел*","подруг*","близк*","родной/родная/родное/родным/родному","семья/семьи/семью/семьёй/семье","как семья","единственн* друг*/товарищ*/существ*"]]},"demo-i2":{"ask":"Что Герасим делал для Муму каждый день и когда ей было плохо?","bad":["бил/била/били/избил*","обижал*","мучил*","морил* голодом","бросил*","выгнал*","прогнал*","ничего не делал*","ничего для неё не делал*"],"fp":"l9hi1c","need":1,"ok":[["спас/спасл*/спасал*/спасен*/спасти","вытащил*","достал* из воды","выручил*","не дал/дала/дали утонуть","не дал/дала/дали погибнуть","подобрал*","приютил*","пригрел*","взял* к себе","принёс/принес домой"],["выходил*","выхажива*","вылечил*","лечил*","ухажива*","выкормил*","выкармлива*","выпаивал*"],["кормил*","кормит*","накормил*","кормить","давал/дал/дала/давали/дава* еду/еды/пищу/есть/молоко/молока/хлеб/хлеба/мясо/косточки","принос* еду/пищу/молоко/хлеб","делился едой","угощал*","поил/поила/поили"],["оберега*","охранял*","защищал*","защитил*","берёг*/берег*","бережно","стерёг*/стерег*","не давал* в обиду","не позволял* обижать","заступал*"],["гладил*","ласкал*","ласково","нежно","обнимал*","прижимал*","не расставался*","не отходил*","брал* с собой","спал* рядом","играл*","гулял*"]]}},"v":1});
