# PatioControl

Control de accesos y salidas en yardas (Camir / API / Carbal-Pia).

- App en producción: https://patiocontrol.netlify.app
- Sheet: https://docs.google.com/spreadsheets/d/1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0/edit
- Evidencias Drive: https://drive.google.com/drive/folders/1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh

## OCR de placas

Tras cada foto de slot `silhouette: plate` (post `re(file, 1280, 0.72)`):

| Slot | Campo |
|------|--------|
| `placa-camion-frontal` | `placa` |
| `placa-camion-trasera` | `placaCamionTrasera` → `placasExtraJson` |
| `placa-caja-1-trasera` | `placaCaja1` |
| `placa-caja-2-trasera` | `placaCaja2` |

- Cliente: `src/lib/placaOcr.js` (`normalizePlacaMX`, `ocrPlacaFromDataUrl`)
- Función: `netlify/functions/ocr-placa.js`
- Env Netlify: `GOOGLE_VISION_API_KEY` (o `GCP_VISION_API_KEY`)
- Sin key → captura manual (mismo espíritu que Carta Porte / BarcodeDetector)

```bash
npm install
npm run dev
npm run build && npm run preview
# con funciones:
npx netlify dev
```
