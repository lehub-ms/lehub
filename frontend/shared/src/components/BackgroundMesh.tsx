/**
 * The four blurred colour fields behind every page. Purely decorative, hence
 * `aria-hidden`; the geometry lives in index.css (see the `.bg-mesh` block).
 */
export function BackgroundMesh() {
  return (
    <div className="bg-mesh" aria-hidden="true">
      <span className="blob-1" />
      <span className="blob-2" />
      <span className="blob-3" />
      <span className="blob-4" />
    </div>
  )
}
