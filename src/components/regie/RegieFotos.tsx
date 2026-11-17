import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Serienaufnahme } from "@/components/Serienaufnahme";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { regieFotosLaden } from "@/lib/regiePdf";
import { bildVerkleinern, sichererDateiname, signierteAdressen } from "@/lib/upload";
import { fotoOrdner, neueId } from "./regieLogik";

type Foto = Awaited<ReturnType<typeof regieFotosLaden>>[number];

/** Fotos am Regiebericht samt signierten Adressen (1 h) */
export function useRegieFotos(berichtId: string | null | undefined) {
  return useQuery({
    queryKey: ["dateien", "regie", berichtId],
    enabled: !!berichtId,
    queryFn: async () => {
      const liste = await regieFotosLaden(berichtId!);
      return { liste, urls: await signierteAdressen(liste.map((f) => f.pfad)) };
    },
  });
}

/**
 * Fotos im Regiebericht — „undicht, gehört getauscht“ zeigt das Foto besser
 * als jeder Satz. Mit Projekt liegen sie im Projektordner (erscheinen dort
 * auch unter Fotos), ohne Projekt unter regie/<id>/. Nach der Unterschrift
 * fest (Trigger dateien_regie_schutz) — sie stehen im PDF.
 *
 * Ein neuer Bericht braucht zuerst eine ID: `vorSpeichern` speichert ihn,
 * der Editor wechselt auf /regie/<id> und öffnet dort die Kamera (`kameraStart`).
 */
export function RegieFotos({
  berichtId, projektId, bearbeitbar, vorSpeichern, kameraStart = false,
}: {
  berichtId: string | null;
  projektId: string | null;
  bearbeitbar: boolean;
  vorSpeichern?: () => Promise<void>;
  kameraStart?: boolean;
}) {
  const { profil, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data, isLoading } = useRegieFotos(berichtId);
  const [kamera, setKamera] = useState(kameraStart && !!berichtId);
  const [laedt, setLaedt] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const liste = data?.liste ?? [];
  const urls = data?.urls ?? {};
  const aktuelles = index !== null ? liste[index] : null;
  const darfLoeschen = (f: Foto) => bearbeitbar && (istChef || f.user_id === profil?.id);

  const starten = async () => {
    if (!berichtId) {
      await vorSpeichern?.();
      return;
    }
    setKamera(true);
  };

  const hochladen = async (dateien: File[]) => {
    const id = berichtId;
    if (!id || !dateien.length) return;
    setLaedt(dateien.length);
    const fehler: string[] = [];
    for (const roh of dateien) {
      const datei = await bildVerkleinern(roh);
      const pfad = `${fotoOrdner(projektId, id)}/${neueId().slice(0, 8)}-${sichererDateiname(datei.name)}`;
      const { error: e1 } = await supabase.storage.from("projekt-dateien").upload(pfad, datei, { contentType: datei.type || "image/jpeg" });
      if (e1) { fehler.push(e1.message); continue; }
      const { error: e2 } = await supabase.from("dateien").insert({
        projekt_id: projektId, regiebericht_id: id, pfad, name: roh.name, mime: datei.type, groesse: datei.size, art: "foto",
        beschreibung: null, planung: false,
      });
      if (e2) {
        await supabase.storage.from("projekt-dateien").remove([pfad]);
        fehler.push(e2.message);
      }
      setLaedt((n) => n - 1);
    }
    setLaedt(0);
    if (fehler.length) toast.error("Nicht alle Fotos gespeichert", { description: fehler[0] });
    else toast.success(dateien.length === 1 ? "Foto gespeichert" : `${dateien.length} Fotos gespeichert`);
    await neuLaden("dateien");
  };

  const loeschen = async (f: Foto) => {
    const { data: weg, error } = await supabase.from("dateien").delete().eq("id", f.id).select("id");
    if (error) return toast.error("Nicht gelöscht", { description: error.message });
    if (!weg?.length) return toast.error("Nicht gelöscht", { description: "Löschen kann nur, wer fotografiert hat, oder der Chef." });
    await supabase.storage.from("projekt-dateien").remove([f.pfad]);
    setIndex(null);
    toast.success("Foto gelöscht");
    await neuLaden("dateien");
  };

  return (
    <div className="space-y-3">
      {isLoading && berichtId ? (
        <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : liste.length === 0 && !laedt ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {bearbeitbar ? "Noch keine Fotos — z. B. vom Schaden vorher und nachher." : "Keine Fotos."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {liste.map((f, i) => (
            <li key={f.id}>
              <button type="button" onClick={() => setIndex(i)}
                className="block aspect-square w-full overflow-hidden rounded-md border bg-muted" aria-label={`Foto ${i + 1} ansehen`}>
                {urls[f.pfad] && <img src={urls[f.pfad]} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </button>
            </li>
          ))}
          {Array.from({ length: laedt }, (_, i) => (
            <li key={`laedt-${i}`} className="flex aspect-square items-center justify-center rounded-md border bg-muted text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </li>
          ))}
        </ul>
      )}

      {bearbeitbar && (
        <Button type="button" variant="outline" className="h-12 w-full gap-2" disabled={laedt > 0} onClick={() => void starten()}>
          <Camera className="h-5 w-5" /> {berichtId ? "Fotos machen" : "Speichern und Fotos machen"}
        </Button>
      )}

      <Serienaufnahme open={kamera} onOpenChange={setKamera} onFertig={hochladen} titel="Fotos zum Regiebericht" />

      <BildBetrachter
        bilder={liste.map((f) => ({ url: urls[f.pfad] ?? "", alt: f.name }))}
        index={index}
        onIndex={setIndex}
        onSchliessen={() => setIndex(null)}
        fuss={aktuelles && darfLoeschen(aktuelles) ? (
          <div className="flex items-center justify-end p-3 text-sm text-white">
            <button type="button" onClick={() => void loeschen(aktuelles)} className="flex h-11 items-center gap-1.5 px-3" aria-label="Foto löschen">
              <Trash2 className="h-4 w-4 text-destructive" /> Löschen
            </button>
          </div>
        ) : undefined}
      />
    </div>
  );
}
