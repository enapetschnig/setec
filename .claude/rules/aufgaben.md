# Aufgaben

- 2026-11-18 · Stefan: Aufgabe für heute angelegt, aber nicht auf der Startseite. Ursache: „Meine Aufgaben“ zeigte nur Aufgaben mit mir unter „Zuständig“ — ohne Zuständigen sah sie dort niemand (Chef legt `zustaendig = []` an). Jetzt gilt `istMeine`/`meineFilter` (`lib/aufgaben.ts`): mir zugeteilt **oder** niemandem zugeteilt und von mir angelegt. Test `tests/roboter/2026-11-18-meine-aufgaben-ohne-zustaendig.mjs`.
