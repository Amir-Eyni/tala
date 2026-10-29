/**
 * Neutral shimmering placeholder used while the first price payload loads.
 *
 * It is purely decorative: the surrounding component owns the live region and
 * the accessible "loading" message, so screen readers never announce the bars.
 */
export default function Skeleton({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`tala-skeleton block rounded-control ${className}`}
    />
  );
}
