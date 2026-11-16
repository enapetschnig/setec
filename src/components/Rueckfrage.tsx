import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type Frage = { titel: string; text: string; knopf: string; gefahr?: boolean; aktion: () => unknown };

/**
 * „Wirklich löschen?“ im Stil der App (wie in BestellungDetail): eine Frage
 * im State halten, `null` = zu. Der Knopf schließt und führt die Aktion aus.
 */
export function Rueckfrage({ frage, onClose }: { frage: Frage | null; onClose: () => void }) {
  return (
    <AlertDialog open={!!frage} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{frage?.titel}</AlertDialogTitle>
          <AlertDialogDescription>{frage?.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
          <Button variant={frage?.gefahr ? "destructive" : "default"} className="h-11"
            onClick={() => {
              const f = frage;
              onClose();
              if (f) Promise.resolve().then(f.aktion).catch((e) => toast.error((e as Error).message));
            }}>
            {frage?.knopf}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
