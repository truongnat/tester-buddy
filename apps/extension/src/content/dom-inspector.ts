function getElementTarget(target: EventTarget | null | undefined): HTMLElement | SVGElement | null {
  if (target instanceof HTMLElement || target instanceof SVGElement) return target;
  if (target instanceof Node) {
    const parent = target.parentNode;
    if (parent instanceof HTMLElement || parent instanceof SVGElement) return parent;
  }
  return null;
}

export function getSelector(target: EventTarget | null | undefined): string {
  const el = getElementTarget(target);
  if (!el) return "unknown";
  if (el.id) return `#${el.id}`;
  if (el instanceof HTMLElement && el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
  const tag = el.tagName.toLowerCase();
  const className = typeof el.className === "string"
    ? el.className
    : el instanceof SVGElement && typeof el.className.baseVal === "string"
      ? el.className.baseVal
      : "";
  const cls = className.trim()
    ? "." + className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${tag}${cls}`;
}

export function injectScript(src: string) {
  const s = document.createElement("script");
  s.src = src;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
}
