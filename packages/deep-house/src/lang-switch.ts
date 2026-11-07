// **The About's language drop-down, and the first saying of the page's words** (round japanese). The drop-down is
// the system's own `<select>`, built from the table's languages (`LANGS`, words.ts), so a third language is a column
// and nothing here: Auto first, saying which language the browser's resolve to ("Auto · 日本語"), then each language
// in its own script. A pick is stored on this device and spoken at once (`choose`); `lang=` on the address, a visit's
// language, is taken off by it.

import { LANGS, lang, onLang, choose, storedChoice, browserLang, langName, startWords, w, type LangChoice } from './words.ts';

function paintPick(sel: HTMLSelectElement): void {
  const choice = storedChoice();
  const want: { value: LangChoice; text: string; lang?: string }[] = [
    { value: 'auto', text: w('about.auto', { lang: langName(browserLang()) }) },
    ...LANGS.map((l) => ({ value: l.tag as LangChoice, text: l.name, lang: l.tag })),
  ];
  if (sel.options.length !== want.length) {
    sel.textContent = '';
    for (const o of want) {
      const opt = document.createElement('option');
      opt.value = o.value;
      if (o.lang) opt.lang = o.lang;
      sel.appendChild(opt);
    }
  }
  want.forEach((o, i) => { if (sel.options[i].textContent !== o.text) sel.options[i].textContent = o.text; });
  if (sel.value !== choice) sel.value = choice;
  // the word drawn under it: the option it shows
  const word = document.getElementById('aboutLangWord');
  const shown = sel.options[sel.selectedIndex]?.textContent ?? '';
  if (word && word.textContent !== shown) word.textContent = shown;
}

startWords();
const sel = document.getElementById('aboutLang') as HTMLSelectElement | null;
if (sel) {
  paintPick(sel);
  sel.addEventListener('change', () => choose(sel.value as LangChoice));
  // the page's one key is Space: a focused drop-down keeps its own keys (Esc still closes the panel)
  sel.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  onLang(() => paintPick(sel));
  window.addEventListener('languagechange', () => paintPick(sel));
}
void lang;
