export function getSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === "string"
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${tag}${cls}`;
}

export function injectScript(src: string) {
  const s = document.createElement("script");
  s.src = src;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
}
