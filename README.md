# Poker-Trainer

Push/Fold-Trainer für Texas-Hold’em-Turniere (8-max, Big-Blind-Ante, 1–20 BB). Die richtigen Antworten stammen aus einem vorberechneten Nash-Gleichgewicht in chip-EV.

**Spielen:** https://finndegray.github.io/poker-trainer/ – am Handy über „Zum Home-Bildschirm“ als App installierbar, danach auch offline nutzbar.

## Bedienung

- **F** = Fold, **A** = All-in bzw. Call, **Leertaste** = nächster Spot
- Nach jeder Entscheidung zeigt der Trainer EVs, den Range-Chart des Spots und dieselbe Hand auf allen anderen Positionen.
- Dein Fortschritt bleibt nur in deinem Browser gespeichert.

## Entwicklung

Voraussetzung: Node.js 24.

    npm install
    npm run dev          # Entwicklungsserver auf http://127.0.0.1:5173/poker-trainer/
    npm test             # alle Tests
    npm run typecheck
    npm run build        # Produktionsbuild nach dist/

Die Push/Fold-Daten liegen fertig in `src/data/pushfold.json`. Neu berechnen (dauert einige Minuten):

    npm run data:equity
    npm run data:pushfold
