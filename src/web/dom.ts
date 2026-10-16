export const NL = String.fromCharCode(10);

export function $<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error("page element missing: #" + id);
  return e as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = String(cls);
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

const remembered = new Map<string, string>(); // for a visit where the browser's storage is blocked

/** Forget what was kept for this visit (tests start every page as a fresh visit). */
export function forgetChoices(): void {
  remembered.clear();
}

/** Small per-browser conveniences (ticks, remembered filters). Real data lives in the database. */
export function tick(key: string, value?: string): string | null {
  if (value !== undefined) remembered.set(key, value);
  try {
    if (value === undefined) return localStorage.getItem(key) ?? remembered.get(key) ?? null;
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; what was chosen is kept for this visit */
    if (value === undefined) return remembered.get(key) ?? null;
  }
  return null;
}

export function copy(text: string, btn: HTMLButtonElement): void {
  const done = () => {
    const old = btn.textContent;
    btn.classList.add("ok");
    btn.textContent = "Copied";
    setTimeout(() => {
      btn.classList.remove("ok");
      btn.textContent = old;
    }, 1200);
  };
  const fallback = () => {
    const ta = el("textarea", { value: text });
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      /* nothing else to try */
    }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

export function download(name: string, content: string | Uint8Array, type = "text/plain"): void {
  const part: BlobPart = typeof content === "string" ? content : (content.slice().buffer as ArrayBuffer);
  const a = el("a", { href: URL.createObjectURL(new Blob([part], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

/** Read text from a picked file. */
export function readFile(f: File): Promise<string> {
  return f.text();
}
