// Shared Bible data loader — fetches each translation once and caches the
// parsed result at module scope so multiple app instances (e.g. two layout
// options mounted side-by-side for review) don't re-fetch/re-parse the same
// large JSON files.

let _cachePromise = null;

export function decodeUnicode(str) {
  if (!str) return "";
  return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 16)));
}

function formatESV(raw) {
  let structured = { books: [] };
  let bookMap = {};
  raw.forEach(item => {
    const parts = item.r.split(':');
    if (parts.length < 4) return;
    const bookName = parts[1];
    const chapterNum = parseInt(parts[2]);
    const verseNum = parseInt(parts[3]);
    if (verseNum === 0) return; // section headings etc, no real verse number

    if (!bookMap[bookName]) {
      bookMap[bookName] = { name: bookName, chapters: [] };
      structured.books.push(bookMap[bookName]);
    }
    let chapter = bookMap[bookName].chapters.find(c => c.chapter === chapterNum);
    if (!chapter) {
      chapter = { chapter: chapterNum, verses: [] };
      bookMap[bookName].chapters.push(chapter);
    }
    const cleanText = (item.t || '').replace(/\*p\s*/g, ' ').replace(/\s+/g, ' ').trim();
    chapter.verses.push({ verse: verseNum, text: cleanText });
  });
  return structured;
}

// Registry of translations this app knows how to load. Missing files are
// skipped gracefully — the app works with however many of these are present.
const VERSION_FILES = {
  kjv: { file: './kjv.json', label: 'KJV', raw: true },
  vie1934: { file: './vie1934.json', label: 'Vietnamese (1934)', raw: true },
  esv: { file: './esv.json', label: 'ESV', raw: true },
  net: { file: './net.json', label: 'NET Bible', raw: true },
  nkjv: { file: './nkjv.json', label: 'New King James Version', raw: true },
  niv: { file: './niv.json', label: 'NIV', raw: true },
};

async function loadOne(key) {
  const cfg = VERSION_FILES[key];
  try {
    const res = await fetch(cfg.file);
    if (!res.ok) throw new Error('missing file');
    const json = await res.json();
    return cfg.raw ? json : formatESV(json);
  } catch (e) {
    console.warn(`Bible translation "${key}" unavailable (${cfg.file}):`, e.message);
    return null;
  }
}

// Returns { bibles: {key: data|null}, available: [key...], bookNames: [...], labels: {key: label} }
export function loadBibles() {
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    const keys = Object.keys(VERSION_FILES);
    const results = await Promise.all(keys.map(loadOne));
    const bibles = {};
    keys.forEach((k, i) => { bibles[k] = results[i]; });
    const available = keys.filter(k => bibles[k]);
    const reference = available.length ? bibles[available[0]] : null;
    const bookNames = reference ? reference.books.map(b => b.name) : [];
    const chapterCounts = reference ? reference.books.map(b => b.chapters.length) : [];
    const labels = {};
    keys.forEach(k => { labels[k] = VERSION_FILES[k].label; });
    return { bibles, available, bookNames, chapterCounts, labels };
  })();
  return _cachePromise;
}

// Old Testament is roughly index 0-38, New Testament 39-65 (matches original heuristic)
export const OT_NT_SPLIT = 38;
