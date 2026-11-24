import * as React from "react";

import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textfeld, das so hoch wird wie sein Text (Stefan 24.11.2026: „das Feld vergrößern, dass der
 * ganze Text lesbar ist“). Wächst beim Tippen, beim Laden und wenn die Spalte schmäler wird.
 */
const TextareaWachsend = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, value, ...props }, ref) => {
  const eigen = React.useRef<HTMLTextAreaElement | null>(null);
  const setzen = React.useCallback((el: HTMLTextAreaElement | null) => {
    eigen.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }, [ref]);

  const anpassen = React.useCallback(() => {
    const el = eigen.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight ohne Rand → Rand dazu, sonst bleibt eine Zeile Bildlauf
    const rand = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + rand}px`;
  }, []);

  React.useLayoutEffect(anpassen, [value, anpassen]);
  React.useEffect(() => {
    const el = eigen.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let breite = el.clientWidth;
    const beobachter = new ResizeObserver(() => {
      if (el.clientWidth !== breite) { breite = el.clientWidth; anpassen(); }
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [anpassen]);

  return <Textarea ref={setzen} value={value} rows={1} className={cn("min-h-0 resize-none overflow-hidden", className)} {...props} />;
});
TextareaWachsend.displayName = "TextareaWachsend";

export { TextareaWachsend };
