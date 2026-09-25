/**
 * Das Zeichen von jichi: fünf Quadrate bilden ein „>“ — die Eingabeaufforderung —,
 * das größere blaue ist der Cursor dahinter.
 *
 * Zwei Verwendungen. Ruhend als Marke (leerer Chat). Animiert als Zeichen
 * dafür, dass jichi arbeitet: der Pfeil läuft von oben nach unten durch, der
 * Cursor blinkt weich — wie eine Konsole, die gerade schreibt. Wer weniger
 * Bewegung eingestellt hat, sieht nur ein ruhiges Blinken des Cursors.
 *
 * Das Raster ist dasselbe wie in `assets/brand/jichi-mark.svg`.
 */

const U = 100;
const PFEIL: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
  [1, 3],
  [0, 4],
];

export function Marke({
  size = 28,
  animiert = false,
  className = "",
}: {
  size?: number;
  animiert?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`jichi-zeichen${animiert ? " arbeitet" : ""} ${className}`}
      viewBox="0 0 465 500"
      width={size}
      height={(size * 500) / 465}
      role="img"
      aria-label={animiert ? "jichi arbeitet" : "jichi"}
    >
      <g className="pfeil">
        {PFEIL.map(([x, y], i) => (
          <rect key={i} x={x * U} y={y * U} width={U} height={U} style={{ animationDelay: `${i * 110}ms` }} />
        ))}
      </g>
      <rect className="cursor" x={325} y={285} width={140} height={140} />
    </svg>
  );
}
