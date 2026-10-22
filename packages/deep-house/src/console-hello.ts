// **The page's hello in the console** (his word 10-21): a reader who opens the console sees the instrument, the name
// and the line under it, as a sign the page started as it should, and nothing about the plumbing. The output path is
// said only where a link asked for one (`?out=`), which only a developer does.

const ART = String.raw`
            o
            |
        .-""|""-.
      .'    |    '.
     /   .--+--.   \
  --(---(---+---)---)--
     \   '--+--'   /
      '.    |    .'
        '-..|..-'
            |
            o
`;

/** Say hello once: the gyroscope in the house gold, the name spaced out, the subtitle quiet. */
export function sayHello(): void {
  if (typeof console === 'undefined') return;
  console.log(
    `%c${ART}%c\n   D E E P   H O U S E\n%c An astrolabe for music\n`,
    'color: #f2c14e; font-family: ui-monospace, Menlo, monospace; line-height: 1.15',
    'color: #f2c14e; font-family: ui-monospace, Menlo, monospace; font-weight: 700',
    'color: #9a8a60; font-family: ui-monospace, Menlo, monospace',
  );
}
