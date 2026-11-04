/**
 * An open notebook drawn entirely in CSS: dark leather cover, two cream
 * pages curving into a stitched spine. Pass `left` and `right` for a
 * two-page spread, or `spread` for one sheet across both pages.
 */
export function Book({
  left,
  right,
  spread,
  className = "",
  ribbon = false,
  children,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  spread?: React.ReactNode;
  className?: string;
  ribbon?: boolean;
  /** Extra layers positioned over the book (e.g. a close button). */
  children?: React.ReactNode;
}) {
  return (
    <div className={`book ${className}`}>
      {ribbon && <span className="book__ribbon" aria-hidden />}
      {spread !== undefined ? (
        <div className="book__spread book__spread--single">
          <div className="page page--spread">{spread}</div>
        </div>
      ) : (
        <div className="book__spread">
          <div className="page page--left">{left}</div>
          <div className="page page--right">{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}
