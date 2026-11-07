// **The page's words, in every language it speaks** (round japanese, his word 11-03: "add Japanese locale, should try
// to figure from browser/os, but we also need a switch in About"). One table keyed by meaning, a column per language
// tag (`en`, `ja`); English is the page as it always read, byte for byte, and `tools/check-words.ts` holds that every
// key has every column, that every `data-w` in index.html names a key, and that the English page's own words are the
// table's. A third language is one more column here and in `words-ring.json` (the ring's readings), and one more
// entry in `LANGS`: the About's drop-down is built from it.
//
// **Which language** (`resolveLang`): the address's `lang=` for the visit (a promo link to the Japanese edition; never
// stored, so it never changes a visitor's own choice), else the choice made in About (stored on this device), else the
// browser's languages in their order, the first the table speaks; English where none is. Tags are BCP 47 and matched
// with fallback: the table's exact tag first (`pt-BR`, `zh-Hans` later), then the primary subtag (`ja-JP` → `ja`),
// case-insensitively. The language is presentation and never music: no link the page writes for sharing carries it.
//
// Pure where it can be: the composer's node tools import the ring's words through `bird-labels.ts`, so nothing here
// touches the DOM or storage unless a browser is there, and English is the language wherever none is resolved.

import { linkRaw, linkQuery } from './link-table.ts';

/** The languages the page speaks, in the About's order: the tag, and the language's name in its own script. */
export const LANGS = [
  { tag: 'en', name: 'English', englishNames: false },
  // his word 11-03: Japanese shows the controls' English names beside its own only where a bird is opened (the
  // desktop's tell line, the phone's panel) and to a reader; never in the default view
  { tag: 'ja', name: '日本語', englishNames: true },
] as const;
export type Lang = (typeof LANGS)[number]['tag'];
export const LANG_TAGS: readonly Lang[] = LANGS.map((l) => l.tag);
/** The About's choice: one language, or the browser's (`auto`). */
export type LangChoice = Lang | 'auto';

/** One meaning, in every language. `{name}` is filled by `w()`. */
type Row = Readonly<Record<Lang, string>>;

/** **The table.** Keys are what the words mean, grouped by where they stand. */
export const WORDS = {
  // --- the page's name and what it is (index.html) ---
  'page.said': {
    en: 'An astrolabe for music: an endless electronic set, every sound synthesized as it plays, fully offline. Nothing is recorded or streamed. Touch the centre to start; the band is the mix ahead, the cells of the star are the eight controls of the sound, and the dice under the centre cast a new set.',
    ja: '音楽のアストロラーベ。すべての音をその場で合成しながら、終わりのない電子音楽のセットを奏でる。完全オフライン。録音音源もストリーミングも使わない。中央に触れると始まる。帯はこの先のミックス、星形の八つのセルは音を調整するコントロール。中央の下のダイスを振ると、新しいセットが始まる。',
  },
  // --- the panel (index.html, library-panel.ts) ---
  'panel.key': { en: 'Playlists · Map · About', ja: 'プレイリスト · マップ · 概要' },
  'panel.name': { en: 'Playlists, Map and About', ja: 'プレイリスト、マップ、概要' },
  'panel.playlists': { en: 'Playlists', ja: 'プレイリスト' },
  'panel.map': { en: 'Map', ja: 'マップ' },
  'panel.about': { en: 'About', ja: '概要' },
  'panel.close': { en: 'Close (Esc)', ja: '閉じる（Esc）' },
  'panel.share': { en: 'Share what plays', ja: '再生中の曲を共有' },
  'panel.shareTip': { en: 'Share', ja: '共有' },
  'panel.machine': { en: 'the machine view', ja: 'マシンビュー' },
  'panel.machineTip': { en: 'Machine view', ja: 'マシンビュー' },
  // --- the About (index.html) ---
  'about.sub': { en: 'An astrolabe for music', ja: '音楽のアストロラーベ' },
  'about.what1': {
    en: 'A clockwork music machine. Roll the dice to wind it, set its eight sigils, and it plays an endless electronic set, every sound synthesized as the gears turn.',
    ja: 'ぜんまい仕掛けの音楽機械。ダイスを振ってぜんまいを巻き、八つの印を合わせると、終わりのない電子音楽のセットを奏でる。歯車の動きとともに、すべての音がその場で合成される。',
  },
  'about.what2': { en: 'Its best sounds are in the Featured playlists.', ja: '選りすぐりの音は「おすすめ」のプレイリストに。' },
  'about.what3': {
    en: 'A music companion for work, reading or a late drive. No distracting vocals. No agenda. Just vibes.',
    ja: '仕事に、読書に、夜のドライブに寄り添う音楽。気を散らすボーカルも、押しつけもない。ただ心地よさだけ。',
  },
  'about.what4': { en: 'One link, one track: it plays the same anywhere.', ja: 'ひとつのリンクに、ひとつの曲。どこで開いても同じように鳴る。' },
  'about.what5': { en: 'Fully offline. No account. No ads. No tracking.', ja: '完全オフライン。アカウントなし。広告なし。トラッキングなし。' },
  'about.follow': { en: 'Follow on X for news', ja: '最新情報は X で' },
  'about.composer': { en: 'Composer Eugene T · Follow', ja: '作曲 Eugene T · フォロー' },
  'about.source': { en: 'Source', ja: 'ソースコード' },
  'about.license': { en: 'License: PolyForm Noncommercial 1.0.0', ja: 'ライセンス：PolyForm Noncommercial 1.0.0' },
  'about.store': { en: 'Download on the App Store', ja: 'App Store からダウンロード' },
  'about.reports': { en: 'Anonymous error reports', ja: '匿名のエラーレポート' },
  'about.on': { en: 'on', ja: 'オン' },
  'about.off': { en: 'off', ja: 'オフ' },
  'about.reportsWhat': {
    en: 'When on, a crash sends what broke and the browser version; a caught fault also sends the track\'s link and where in it. Nothing about you.',
    ja: 'オンのとき、クラッシュ時のエラー情報とブラウザのバージョンを送る。検出した不具合では、曲のリンクと再生位置も送る。あなたに関する情報は送らない。',
  },
  'about.language': { en: 'Language', ja: '言語' },
  /** the drop-down's first entry: the browser's language, and which one that is (`{lang}`, in its own script) */
  'about.auto': { en: 'Auto · {lang}', ja: '自動 · {lang}' },
  // --- the Map (index.html, genres-sky.ts) ---
  'map.recentre': { en: 'Reset view', ja: '表示をリセット' },
  'map.family': { en: 'Family', ja: '系統' },
  'map.familyTip': { en: 'Lines join a family\'s tuned genres', ja: '線は同じ系統の調整済みジャンルを結ぶ' },
  'map.familySaid': { en: ': lines join a family\'s tuned genres', ja: '：線は同じ系統の調整済みジャンルを結ぶ' },
  'map.playlist': { en: 'Playlist', ja: 'プレイリスト' },
  'map.playlistTip': { en: 'The playing playlist\'s tracks, in order', ja: '再生中のプレイリストの曲を順に' },
  'map.playlistSaid': { en: ': the playing playlist\'s tracks, in order', ja: '：再生中のプレイリストの曲を順に' },
  'map.sky': { en: 'The genre sky', ja: 'ジャンルの星空' },
  'map.near': { en: 'Near {name} {n}', ja: '{name}の近く {n}' },
  'map.nearTip': { en: 'NEAR {name}', ja: '{name}の近く' },
  // --- the phone's panel for a control (index.html, ring.ts) ---
  'bird.panel': { en: 'the ring\'s control', ja: 'リングのコントロール' },
  'bird.less': { en: 'less', ja: '弱く' },
  'bird.more': { en: 'more', ja: '強く' },
  'bird.slider': { en: 'percent of the house', ja: '基準に対するパーセント' },
  // --- the ring (index.html, ring.ts) ---
  'ring.controls': { en: 'the eight controls of the sound', ja: '音の八つのコントロール' },
  'ring.transport': { en: 'transport', ja: '再生コントロール' },
  'ring.play': { en: 'play', ja: '再生' },
  'ring.pause': { en: 'pause', ja: '一時停止' },
  'ring.about': { en: 'about', ja: '概要' },
  'ring.aboutKey': { en: 'About', ja: '概要' },
  'ring.skip': { en: 'skip', ja: '次へ' },
  'ring.back': { en: 'back', ja: '前へ' },
  'ring.cast': { en: 'cast', ja: '振る' },
  'ring.save': { en: 'save', ja: '保存' },
  'ring.saveWhat': { en: 'Save what plays', ja: '再生中の曲を保存' },
  'ring.saveTip': { en: 'Save to playlist', ja: 'プレイリストに保存' },
  'ring.release': { en: 'release', ja: '解除' },
  'ring.releaseSaid': { en: 'release all of the ring\'s controls', ja: 'リングのコントロールの固定をすべて解除' },
  'ring.released': { en: 'the ring\'s controls released', ja: 'リングのコントロールの固定を解除しました' },
  'ring.seed': { en: 'seed', ja: 'シード' },
  'ring.seedLine': { en: 'seed {seed}', ja: 'シード {seed}' },
  'ring.seedInput': { en: 'master seed', ja: 'マスターシード' },
  'ring.cutIn': { en: 'cut in {n}', ja: '切り替えまで{n}小節' },
  'ring.playing': { en: 'Playing', ja: '再生中' },
  'ring.paused': { en: 'Paused', ja: '一時停止中' },
  'ring.themeSaid': { en: 'Theme {n}, {key}, {bpm}', ja: 'テーマ {n}、{key}、{bpm}' },
  'ring.cellLabel': { en: '{name}, {means} · {says}', ja: '{name}、{means} · {says}' },
  'ring.cellHeld': { en: ', held at {pct} percent', ja: '、{pct}パーセントで固定' },
  'ring.valueHeld': { en: '{pct} percent of the house, held · {says}', ja: '基準の{pct}パーセント、固定中 · {says}' },
  'ring.value': { en: '{pct} percent of the house · {says}', ja: '基準の{pct}パーセント · {says}' },
  // the controls' names (his word 11-03, "use archetypal for birds in Japanese"): Latin in English; in Japanese the
  // godai's five, the moon, Raijin's thunder and Tanabata's weaver
  'bird.ember': { en: 'Ember', ja: '火' },
  'bird.tide': { en: 'Tide', ja: '水' },
  'bird.zephyr': { en: 'Zephyr', ja: '風' },
  'bird.root': { en: 'Root', ja: '地' },
  'bird.gleam': { en: 'Gleam', ja: '月' },
  'bird.veil': { en: 'Veil', ja: '空' },
  'bird.spark': { en: 'Spark', ja: '雷' },
  'bird.loom': { en: 'Loom', ja: '織' },
  'ring.nameBoth': { en: '{name} · {latin}', ja: '{name} · {latin}' },
  'ring.heldAt': { en: '{name} held at {pct} percent', ja: '{name}を{pct}パーセントで固定' },
  'ring.releasedOne': { en: '{name} released', ja: '{name}の固定を解除しました' },
  // what each control is about, a plain noun (the birds keep their names)
  'means.root': { en: 'the low end', ja: '低音域' },
  'means.gleam': { en: 'the harmony', ja: 'ハーモニー' },
  'means.zephyr': { en: 'the brightness and the keys', ja: '明るさと鍵盤' },
  'means.spark': { en: 'the beat', ja: 'ビート' },
  'means.ember': { en: 'the drive and the tempo', ja: 'ドライブ感とテンポ' },
  'means.veil': { en: 'the pace of change', ja: '変化のペース' },
  'means.tide': { en: 'the space round the notes', ja: '音を包む空間' },
  'means.loom': { en: 'the form', ja: '曲の構成' },
  // the sections, short on the rim and whole under the needle
  'section.short.intro': { en: 'int', ja: 'イントロ' },
  'section.short.build': { en: 'bld', ja: 'ビルド' },
  'section.short.main': { en: 'grv', ja: 'グルーヴ' },
  'section.short.breakdown': { en: 'brk', ja: 'ブレイク' },
  'section.short.drop': { en: 'drp', ja: 'ドロップ' },
  'section.short.outro': { en: 'out', ja: 'アウトロ' },
  // --- the playing playlist under the ring, and the share circle (playlists-ui.ts) ---
  'now.playingFrom': { en: 'Playing from {name}, {at}: open it', ja: '{name}から再生中、{at}：開く' },
  'now.in': { en: 'In {name}, {at}: open it', ja: '{name}、{at}：開く' },
  'now.of': { en: '{i} of {n}', ja: '{n}曲中{i}曲目' },
  'share.menu': { en: 'Share', ja: '共有' },
  'share.copy': { en: 'Copy link', ja: 'リンクをコピー' },
  'share.copyAt': { en: 'Copy at {at}', ja: '{at} からのリンクをコピー' },
  'share.native': { en: 'Share…', ja: '共有…' },
  'share.app': { en: 'Open in app', ja: 'アプリで開く' },
  'share.copied': { en: 'Copied', ja: 'コピーしました' },
  'share.linkCopied': { en: 'Link copied', ja: 'リンクをコピーしました' },
  'share.long': { en: 'Long link', ja: '長いリンク' },
  'share.getApp': { en: 'Get the app', ja: 'アプリを入手' },
  'share.notInstalled': { en: 'Not installed?', ja: 'アプリがない場合' },
  // --- playlists (playlists-ui.ts) ---
  'pl.saved': { en: 'Saved', ja: '保存済み' },
  'pl.featured': { en: 'Featured', ja: 'おすすめ' },
  'pl.yours': { en: 'Your playlists', ja: 'マイプレイリスト' },
  'pl.yoursFirst': { en: 'Love a track to start your own', ja: '曲にハートを付けると、自分のプレイリストができる' },
  'pl.none': { en: 'No playlists yet', ja: 'プレイリストはまだありません' },
  'pl.noneHint': { en: 'Press the heart on the ring to save', ja: 'リングのハートで保存' },
  'pl.alreadyThere': { en: 'Already there', ja: '追加済み' },
  'pl.savedTo': { en: 'Saved', ja: '保存しました' },
  'pl.saveTo': { en: 'Save to', ja: '保存先' },
  'pl.newer': { en: 'Needs a newer version', ja: '新しいバージョンが必要' },
  'pl.cantPlay': { en: 'Can’t play this link', ja: 'このリンクは再生できません' },
  'pl.cantRead': { en: 'Can’t read this file', ja: 'このファイルは読み込めません' },
  'pl.title': { en: 'Theme {n} · seed {seed}', ja: 'テーマ {n} · シード {seed}' },
  'pl.repeat': { en: ' · Repeat', ja: ' · リピート' },
  'pl.track': { en: '{n} track', ja: '{n}曲' },
  'pl.tracks': { en: '{n} tracks', ja: '{n}曲' },
  'pl.minutes': { en: '{m} m', ja: '{m}分' },
  'pl.hours': { en: '{h} h {m} m', ja: '{h}時間{m}分' },
  'pl.new': { en: 'New', ja: '新規' },
  'pl.newList': { en: 'New playlist', ja: '新しいプレイリスト' },
  'pl.name': { en: 'Name', ja: '名前' },
  'pl.listName': { en: 'Playlist name', ja: 'プレイリスト名' },
  'pl.label': { en: 'Label', ja: '曲名' },
  'pl.save': { en: 'Save', ja: '保存' },
  'pl.open': { en: 'Open', ja: '開く' },
  'pl.openFile': { en: 'Open file', ja: 'ファイルを開く' },
  'pl.openTip': { en: 'Open a .deephouse file', ja: '.deephouse ファイルを開く' },
  'pl.backup': { en: 'Back up', ja: 'バックアップ' },
  'pl.backupTip': { en: 'Back up everything', ja: 'すべてをバックアップ' },
  'pl.shareLink': { en: 'Share link', ja: 'リンクを共有' },
  'pl.track1': { en: 'Track', ja: '曲' },
  'pl.playlist': { en: 'Playlist', ja: 'プレイリスト' },
  'pl.play': { en: 'Play {name}', ja: '{name}を再生' },
  'pl.back': { en: 'Back', ja: '戻る' },
  'pl.allLists': { en: 'All playlists', ja: 'すべてのプレイリスト' },
  'pl.moveUp': { en: 'Move up', ja: '上へ移動' },
  'pl.moveDown': { en: 'Move down', ja: '下へ移動' },
  'pl.rename': { en: 'Rename', ja: '名前を変更' },
  'pl.moveTo': { en: 'Move to', ja: '移動先' },
  'pl.moveToOpen': { en: 'Move to…', ja: '移動…' },
  'pl.copyTo': { en: 'Copy to', ja: 'コピー先' },
  'pl.copyToOpen': { en: 'Copy to…', ja: 'コピー…' },
  'pl.remove': { en: 'Remove', ja: '削除' },
  'pl.download': { en: 'Download', ja: 'ダウンロード' },
  'pl.saveCopy': { en: 'Save a copy', ja: 'コピーを保存' },
  'pl.keepBoth': { en: 'Keep both', ja: '両方残す' },
  'pl.replace': { en: 'Replace', ja: '置き換える' },
  'pl.cancel': { en: 'Cancel', ja: 'キャンセル' },
  'pl.merge': { en: 'Import', ja: '読み込む' },
  'pl.undo': { en: 'Undo', ja: '取り消す' },
  'pl.updated': { en: 'Updated', ja: '更新しました' },
  'pl.savedCopy': { en: 'Saved a copy', ja: 'コピーを保存しました' },
  'pl.imported': { en: 'Imported', ja: '読み込みました' },
  'pl.replaced': { en: 'Replaced', ja: '置き換えました' },
  'pl.removed': { en: 'Removed {name}', ja: '{name}を削除しました' },
  'pl.movedTo': { en: 'Moved to {name}', ja: '{name}に移動しました' },
  'pl.copiedTo': { en: 'Copied to {name}', ja: '{name}にコピーしました' },
  'pl.moved': { en: 'Moved {name}', ja: '{name}を移動しました' },
  'pl.fromFile': { en: 'From a file · {name}', ja: 'ファイルから · {name}' },
  'pl.fromLink': { en: 'From a link · {name}', ja: 'リンクから · {name}' },
  'pl.askFile': { en: 'From a file', ja: 'ファイルから' },
  'pl.alreadyHere': { en: '“{name}” is already here', ja: '「{name}」はすでにあります' },
  'pl.askBackup': { en: 'A backup', ja: 'バックアップ' },
  'pl.replaceAll': { en: 'Replace instead', ja: 'すべて置き換える' },
  'pl.badLink': { en: 'bad playlist link', ja: '読み込めないプレイリストのリンク' },
  'pl.badLinkLong': { en: 'the playlist link was not read ({why}); the page opens as it would', ja: 'プレイリストのリンクを読み込めませんでした（{why}）。ページは通常どおり開きます' },
  // --- a playlist file or backup, and this device's storage (playlists.ts) ---
  'lib.notJson': { en: 'This file is not a Deep House library: it does not read as JSON.', ja: 'このファイルは Deep House のライブラリではありません：JSON として読み取れません。' },
  'lib.noPlaylists': { en: 'This file is not a Deep House library: it holds no playlists.', ja: 'このファイルは Deep House のライブラリではありません：プレイリストがありません。' },
  'lib.format': { en: 'This file is not a Deep House library: its format is {v}.', ja: 'このファイルは Deep House のライブラリではありません：形式は {v} です。' },
  'lib.version': { en: 'This library names a version this edition cannot read ({v}).', ja: 'このバージョンでは読み込めないライブラリです（{v}）。' },
  'lib.newer': { en: 'This library was written by a newer Deep House (version {v}); this edition reads version {ours}. Update the app to open it.', ja: 'このライブラリは新しい Deep House で作成されています（ファイル形式 {v}）。このアプリが対応するファイル形式は {ours} までです。開くにはアプリの更新が必要です。' },
  'lib.kind': { en: 'This file holds a kind of Deep House file this edition does not know ({v}).', ja: 'このバージョンでは対応していない種類の Deep House ファイルです（{v}）。' },
  'lib.single': { en: 'This playlist file holds no single playlist.', ja: 'このファイルには、プレイリストがないか、複数入っています。' },
  'lib.noStorage': { en: 'This browser keeps no storage for this page, so playlists cannot be saved here.', ja: 'このブラウザではページの保存領域を使えないため、プレイリストを保存できません。' },
  'lib.full': { en: 'This browser\'s storage for the page is full, so the change was not saved. Back up everything, then remove a playlist or old tracks.', ja: 'このページの保存領域がいっぱいのため、変更は保存されませんでした。すべてをバックアップしてから、プレイリストか古い曲を削除してください。' },
  'lib.refused': { en: 'This browser refused to save the playlists.', ja: 'このブラウザではプレイリストを保存できませんでした。' },
  'lib.adds': { en: 'adds {n}', ja: '{n}曲を追加' },
  'lib.label': { en: 'updates {n} label', ja: '{n}件の曲名を更新' },
  'lib.labels': { en: 'updates {n} labels', ja: '{n}件の曲名を更新' },
  'lib.removes': { en: 'removes {n}', ja: '{n}曲を削除' },
  'lib.newList': { en: 'new playlist {name}', ja: '新しいプレイリスト {name}' },
  'lib.renames': { en: 'renames {from} to {to}', ja: '{from}の名前を{to}に変更' },
  'lib.removesList': { en: 'removes playlist {name}', ja: 'プレイリスト {name}を削除' },
  'lib.bad': { en: '{n} link this edition cannot play', ja: 'このバージョンで再生できないリンク {n}件' },
  'lib.bads': { en: '{n} links this edition cannot play', ja: 'このバージョンで再生できないリンク {n}件' },
  'lib.joint': { en: ', ', ja: '、' },
  'lib.nothing': { en: 'Nothing new', ja: '変更なし' },
  // --- a link the page would not play in full (link.ts): the ring's one line, and the whole sentence ---
  'link.seed': { en: 'bad seed · the house', ja: '無効なシード · 基準' },
  'link.seedLong': { en: 'seed {v} is not a seed anybody could type; the page opens where it would with none', ja: 'シード {v} は有効な形式ではない。シードなしで開く' },
  'link.count': { en: 'bad {param} · {word}', ja: '無効な{param} · {word}' },
  'link.countLong': { en: '{param} {v} is not a count from one; the page opens on {word}', ja: '{param} {v} は1以上の整数ではない。{word}で開く' },
  'link.themeOne': { en: 'theme one', ja: 'テーマ 1' },
  'link.barOne': { en: 'bar one', ja: '1小節目' },
  'link.engine': { en: 'no such engine · v{ver}', ja: 'そのエンジンはない · v{ver}' },
  'link.engineLong': { en: 'v {v} names no engine in this build; the page plays v{ver}', ja: 'v {v} はこのビルドのエンジンではない。v{ver} で再生する' },
  'link.spell': { en: 'bad spell · the house', ja: '無効な設定 · 基準' },
  'link.spellLong': { en: 'spell {v} does not read as name:value pairs; the page plays the house', ja: 'spell {v} は name:value の組として読み取れない。基準の設定で再生する' },
  'link.accompaniment': { en: 'bad accompaniment · the house', ja: '無効な伴奏設定 · 基準' },
  'link.accompanimentLong': { en: 'accompaniment {v} is not base or auto; the page plays base', ja: '伴奏 {v} は base でも auto でもない。base で再生する' },
  'link.development': { en: 'bad development · the house', ja: '無効な展開設定 · 基準' },
  'link.developmentLong': { en: 'development {v} is not a mode this page has; the page plays base', ja: '展開 {v} はこのページのモードではない。base で再生する' },
  'link.recipe': { en: 'no such recipe · the house', ja: 'そのレシピはない · 基準' },
  'link.recipeLong': { en: 'no recipe in this build is called {v}; the page plays the house', ja: '{v} というレシピはこのビルドにない。基準の設定で再生する' },
  'link.alone': { en: 'hand part alone · the house', ja: 'ハンドパーカッションのパート単独 · 基準' },
  'link.aloneLong': { en: 'recipe {v} is a part and plays only over its accompaniment (add accompaniment=auto); the page plays the house', ja: 'レシピ {v} は伴奏と組み合わせて鳴るパート。再生には accompaniment=auto が必要。基準の設定で再生する' },
  'link.refused': { en: '{param} refused · the house', ja: '{param} は適用できない · 基準' },
  'link.refusedLong': { en: '{param} {v} was refused: {why}; the page plays without it', ja: '{param} {v} は適用できない：{why}。この設定なしで再生する' },
  'link.theme': { en: 'theme refused · theme one', ja: 'テーマは適用できない · テーマ 1' },
  'link.themeLong': { en: 'theme {v} was refused: {why}; the page opens on theme one', ja: 'テーマ {v} は適用できない：{why}。テーマ 1 で開く' },
  'link.plan': { en: 'this link will not plan', ja: 'このリンクから曲を生成できない' },
  'link.planLong': { en: 'the planner refused this link and nothing on it could be taken off: {why}', ja: 'このリンクから曲を生成できず、設定を外しても解消できなかった：{why}' },
  'link.lang': { en: 'no such language · {lang}', ja: '未対応の言語 · {lang}' },
  'link.langLong': { en: 'lang {v} names no language this page speaks; the page speaks {lang}', ja: 'lang {v} は未対応。{lang} で表示する' },
  // --- the lock screen and the Bluetooth line (control.ts) ---
  'media.theme': { en: 'Theme {n}', ja: 'テーマ {n}' },
  'media.seed': { en: 'seed {seed}', ja: 'シード {seed}' },
} as const satisfies Record<string, Row>;

export type WordKey = keyof typeof WORDS;

// --- the language ------------------------------------------------------------------------------------------------

/** Where the About's choice is kept on this device. */
export const LANG_KEY = 'deephouse.lang';

/**
 * **A BCP 47 tag, matched to a language the table speaks**: the exact tag first, then its primary subtag, either
 * case-insensitively; null where the table speaks neither.
 */
export function matchLang(tag: string | null | undefined): Lang | null {
  const t = String(tag ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!t) return null;
  const exact = LANG_TAGS.find((l) => l.toLowerCase() === t);
  if (exact) return exact;
  const primary = t.split('-')[0];
  return LANG_TAGS.find((l) => l.toLowerCase() === primary) ?? null;
}

/** The browser's (the system's) languages in their order: the first the table speaks, else English. */
export function browserLang(langs?: readonly string[] | null): Lang {
  const list = langs ?? (typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const tag of list) { const l = matchLang(tag); if (l) return l; }
  return 'en';
}

/** The choice stored in About, where a browser keeps one. */
export function storedChoice(): LangChoice {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
    return v && v !== 'auto' ? (matchLang(v) ?? 'auto') : 'auto';
  } catch (e) { return 'auto'; }
}

/** The address's `lang=` as given, raw (the link's row; `link.ts` refuses a tag no column has). */
const addressLang = (): string | null => {
  try { return typeof location !== 'undefined' ? linkRaw('lang') : null; } catch (e) { return null; }
};

/** **Which language the page speaks**: the address, then the About's choice, then the browser's languages. */
export function resolveLang(o: { address?: string | null; choice?: LangChoice; browser?: readonly string[] | null } = {}): Lang {
  const a = matchLang(o.address === undefined ? addressLang() : o.address);
  if (a) return a;
  const c = o.choice ?? storedChoice();
  if (c !== 'auto') return c;
  return browserLang(o.browser);
}

let now: Lang = typeof window === 'undefined' ? 'en' : resolveLang();
const told = new Set<(l: Lang) => void>();

/** The language the page speaks now. */
export const lang = (): Lang => now;

/** Be told when the language changes; returns the way to stop. */
export function onLang(fn: (l: Lang) => void): () => void {
  told.add(fn);
  return () => told.delete(fn);
}

/** Speak `l` from now on: the document's `lang`, the marked words, and everyone listening. */
export function speak(l: Lang): void {
  if (l === now && typeof document !== 'undefined' && document.documentElement.lang === l) return;
  now = l;
  if (typeof document !== 'undefined') { document.documentElement.lang = l; markNames(); applyWords(document); }
  for (const fn of told) {
    try { fn(l); } catch (e) { console.error(e); }
  }
}

/**
 * **The About's choice**: stored on this device (guarded), and the page speaks it at once. A choice made while the
 * address carries `lang=` takes `lang=` off the address (the visitor has now chosen for themselves).
 */
export function choose(c: LangChoice): void {
  try { if (c === 'auto') localStorage.removeItem(LANG_KEY); else localStorage.setItem(LANG_KEY, c); } catch (e) { /* storage blocked: this page only */ }
  try {
    if (typeof location !== 'undefined' && linkRaw('lang') !== null) {
      const q = linkQuery();
      q.delete('lang');
      const s = q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
      history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
    }
  } catch (e) { /* a page with no history to write on */ }
  speak(resolveLang({ address: null, choice: c }));
}

// --- the controls' names ------------------------------------------------------------------------------------------

/** A control's name in the language spoken: 火 水 風 地 空 月 雷 織 in Japanese, the Latin name in English. */
export const birdName = (bird: string, l: Lang = now): string => w(`bird.${bird}` as WordKey, undefined, l);
/** Whether the language spoken shows the English names beside its own (`LANGS`, one fact per language). */
export const englishNames = (l: Lang = now): boolean => !!LANGS.find((x) => x.tag === l)?.englishNames;
/**
 * **Where a bird is opened** (his word 11-03: "show it once the user clicks the bird … or on mobile in the popup panel,
 * but not permanently in the ring … no English should be visible in default UX"): the desktop's tell line, the phone's
 * panel and a reader's label say the language's name and, where the language says so, the English beside it.
 */
export function birdNameBoth(bird: string, l: Lang = now): string {
  const name = birdName(bird, l), latin = birdName(bird, 'en');
  return name === latin || !englishNames(l) ? name : w('ring.nameBoth', { name, latin }, l);
}

// --- the words --------------------------------------------------------------------------------------------------

const fillIn = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m)) : s;

/** A meaning in the language spoken now (or the one asked), its `{name}`s filled. */
export function w(key: WordKey, vars?: Record<string, string | number>, l: Lang = now): string {
  const row = WORDS[key] as Row;
  return fillIn(row[l] ?? row.en, vars);
}

/**
 * **A featured playlist's name in the language spoken now** (his word 11-06: the featured lists are ours, so they speak
 * the page's language; the keys and the links stay as they are). A name not in the table, or English, is the table's
 * own. Vibe is ムード, never the katakana バイブ, which reads as a vibrator.
 */
const FEATURED_NAMES: Record<string, Partial<Record<Lang, string>>> = {
  vibe: { ja: 'ムード' },
  drive: { ja: 'ドライブ' },
  ambient: { ja: 'アンビエント' },
};
export const featuredName = (key: string, name: string, l: Lang = now): string => FEATURED_NAMES[key]?.[l] ?? name;

/** The language's own name, in its own script. */
export const langName = (l: Lang): string => LANGS.find((x) => x.tag === l)?.name ?? l;

/**
 * **The marked words of a document, in the language spoken**: `data-w` is the text (`data-w-text` its one own text
 * node, beside other children), `data-w-label` the
 * `aria-label`, `data-w-title` the `title`, `data-w-alt` the `alt`, `data-w-placeholder` the placeholder.
 */
export function applyWords(root: ParentNode): void {
  const each = (attr: string, put: (el: HTMLElement, s: string) => void) => {
    for (const el of root.querySelectorAll<HTMLElement>(`[${attr}]`)) {
      const k = el.getAttribute(attr) as WordKey;
      if (!(k in WORDS)) continue;
      const s = w(k);
      put(el, s);
    }
  };
  each('data-w', (el, s) => { if (el.textContent !== s) el.textContent = s; });
  // an element whose own words are one text node among its children (the Map's legend: a line, the word, a said tail)
  each('data-w-text', (el, s) => {
    const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim());
    if (t && t.textContent !== s) t.textContent = s;
  });
  each('data-w-label', (el, s) => { if (el.getAttribute('aria-label') !== s) el.setAttribute('aria-label', s); });
  each('data-w-title', (el, s) => { if (el.getAttribute('title') !== s) el.setAttribute('title', s); });
  each('data-w-alt', (el, s) => { if (el.getAttribute('alt') !== s) el.setAttribute('alt', s); });
  each('data-w-placeholder', (el, s) => { if (el.getAttribute('placeholder') !== s) el.setAttribute('placeholder', s); });
}

/** The page says which kind of names the ring carries, for the type: `seal` where each is one character (no tracking, a seal's size). */
function markNames(): void {
  // keyed to the names being one character each, so a language with longer names is never enlarged by accident
  const names = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'].map((b) => birdName(b));
  document.documentElement.dataset.birdNames = names.every((n) => [...n].length === 1) ? 'seal' : 'latin';
}

/** The first saying: the document's `lang` and its marked words, before the ring draws (a no-op in English). */
export function startWords(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = now;
  markNames();
  if (now !== 'en') applyWords(document);
  // a change of the system's languages, heard while the choice is the browser's own
  if (typeof window !== 'undefined') window.addEventListener('languagechange', () => { if (storedChoice() === 'auto' && !matchLang(addressLang())) speak(resolveLang()); });
}
