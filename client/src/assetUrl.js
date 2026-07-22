/** Resolve public asset paths under Vite `base` (needed for GitHub Pages). */
export function assetUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const clean = String(path).replace(/^\//, '');
  return `${base.endsWith('/') ? base : `${base}/`}${clean}`;
}
