# AeroStudy AI — 7-feature request

Server: Vite dev on port 4200 (pid varies). NEVER pm2/bun start (EADDRINUSE).
Verify: `bunx tsc --noEmit -p packages/web/tsconfig.json`

## Priority order
1. Schemas pro + zoom/download (URGENT) — Feature 2
2. Exercices/Klausuren PDF (Haute) — Feature 1
3. Text zoom (Haute) — Feature 3
4. Document deletion (Haute) — Feature 4
5. Image/scan in chat (Moyenne) — Feature 5
6. Scratchpad/brouillon (Moyenne) — Feature 6
7. MATLAB/Python mode (Moyenne) — Feature 7

## Batch 1 (DONE, verified): Features 3, 4, 2
NOTE: `bunx tsc --noEmit -p tsconfig.json` is a NO-OP (solution config, files:[]).
Real check = `bunx tsc --build --force`. Project has PRE-EXISTING errors in
page.tsx/auth.ts/chat.tsx/dna.tsx/tikz.ts:152 (untouched) — app runs on Vite anyway.
GOTCHA: never send >1 edit to the SAME file in one parallel block — only the last survives.

### Feature 3 — Text zoom
- [x] stores/font-size.ts (small16/medium20/large24, persist, data-font-size on <html>)
- [x] components/font-size-toggle.tsx ("Aa" dropdown)
- [ ] wire into provider.tsx (apply on mount)
- [ ] add to layout.tsx header
- [ ] CSS in styles.css (.reading-scalable scaling via html[data-font-size])
- [ ] add .reading-scalable to MarkdownContent wrapper + dictionary def text
- [ ] i18n fontSize.* keys (de/fr/en)

### Feature 4 — Document deletion (Dashboard "Mes documents")
NOTE: single-delete already exists in components/document-library.tsx (chat sidebar, native confirm).
- [ ] Dashboard: list docs with name/date/pages, per-row trash + Modal confirm (filename)
- [ ] bulk: checkboxes + "Supprimer la sélection" bar
- [ ] add removeMany to api/routes/documents.ts + query option
- [ ] i18n keys

### Feature 2 — Schemas pro + fullscreen zoom/download
- [ ] shared DiagramZoom wrapper (click->modal, wheel zoom, download PNG/SVG) around Mermaid/Tikz/Chart in diagram-blocks.tsx
- [ ] strengthen TikZ style guidance in api/agent system prompt (colors/arrows/grid)
- [ ] i18n keys (download, zoom)

## Batch 1 status: DONE + verified (app 200 on Vite:4200)

## REMAINING (user said "fait tout complet") — model=claude-sonnet-4.6 (vision OK)
i18n: add keys to de.ts FIRST (source of Messages type), then mirror fr.ts + en.ts.
Chat stream endpoint: /api/agent/messages -> createAgentUIStreamResponse({agent,uiMessages}).
send() at chat.tsx:471 uses sendMessage({text}). Composer at ~993. MessageBubble ~1078.

### Batch 2 — F5 image chat + F7 mode calcul — DONE (all modules transform 200, err=0)
F5:
- [x] composer: 📎 button + hidden <input type=file accept=image/* capture=environment>, multi
- [x] attachment state -> thumbnails above textarea, remove btn
- [x] send with files: sendMessage({text, files}) ; render image parts in MessageBubble + fullscreen (ImageFrame reuses ZoomOverlay)
- [x] agent prompt: note it can see uploaded images (handwritten exercises)
- [x] i18n
F7:
- [x] settings: codeLang pref MATLAB|Python (stores/preferences.ts, section added to settings.tsx)
- [x] chat: 🧮 Mode Calcul toggle -> send calcMode+codeLang in transport body
- [x] agent: when calcMode, emit commented MATLAB/Python + simulated output
- [x] markdown-content: CodeBlock w/ highlight.js, copy, download .m/.py, explain-line-by-line (CodeExplainContext provided in chat)
- [x] add highlight.js dep
- [x] i18n

### Batch 3 — F6 scratchpad/brouillon — DONE (transform 200 err=0)
- [x] stores/scratchpad.ts (persist localStorage)
- [x] components/scratchpad.tsx: textarea+LaTeX preview, toolbar (B/I/formula/list), autosave, send-to-AI, clear, export PDF
- [x] lib/pdf-print.ts shared print util (reuses app stylesheets + A4 CSS)
- [x] chat layout: desktop ~40% side panel, mobile full-screen tab; toggle button in scope bar
- [x] i18n (scratchpad.sendToAiPrompt added)

### Batch 4 — F1 exercises page + PDF — DONE (transform 200, api 401=loaded, tsc clean)
- [x] lib/pdf-print.ts shared (reuses app stylesheets + A4 print CSS) — also used by F6
- [x] backend POST /api/agent/exercise (generateText grounded, mode=exercise|klausur, basedOnId for Klausuren) returns JSON {title,points,statement,solution,scale}
- [x] pages/exercises.tsx: generator (Fach/Kapitel/Schwierigkeit/Typ) + Klausuren tab (kind=klausur docs -> generate practice Klausur), copy/showSolution/exportPdf/regenerate
- [x] app.tsx route /exercises + sidebar nav item (PenSquare icon, key nav.exercises)
- [x] i18n (all 3 locales mirrored: scratchpad 18, calc 11, exercises 39)

## ALL 7 FEATURES DONE. Type-check: only pre-existing chat.tsx:196 headers
## error remains (untouched original transport code). Ready to deliver :4200.

## 📎 Upload menu redesign (3 options) — DONE (verified: modules transform 200, no console errors)
- Replaced single Paperclip→file-input with a DropdownMenu (side="top") offering 3 options:
  1. Fichiers/Dateien/Files — hidden input, accept pdf/png/jpg/jpeg/webp/txt, multiple, 20MB cap
  2. Galerie/Gallery — hidden input, images only, multiple
  3. Caméra/Kamera/Camera — opens new CameraCapture modal (getUserMedia, capture + retake + confirm)
- New file: components/camera-capture.tsx (getUserMedia facingMode environment, stream cleanup, JPEG capture, retake, permission-error fallback message).
- chat.tsx: Attachment type now {mediaType, kind:image|doc, text?}; addFiles validates type+size, reads txt to text; send() sends image/pdf as file parts + inlines txt into prompt; doc attachments show file chips; image attachments show thumbnails; inline attachError banner.
- i18n: added chat.{removeFile,attachAdd,attachFiles,attachFilesHint,attachGallery,attachGalleryHint,attachCamera,attachCameraHint,fileTooLarge,fileType,cameraTitle,cameraCapture,cameraRetake,cameraUse,cameraCancel,cameraError,cameraLoading} in de/fr/en.

## Session update ($(date +%Y-%m-%d))
- FIXED exercise/Klausur generation: packages/web/src/api/index.ts now uses generateObject (Zod schema) as primary path + generateText/parseLooseJson fallback. Root cause was JSON.parse choking on LaTeX escapes. Verified: endpoint 401 unauth, module transforms clean, standalone repro succeeded.
- ADDED Apple sign-in on web login (login.tsx handleApple + AppleIcon), i18n keys auth.apple in de/fr/en. Google already existed. Both use Runable managed auth (no extra credentials).
- Mobile package (packages/mobile) is still the default Expo starter stub (tabs: index/explore, no auth, no real app). Real product = web app. No mobile social login added since there is no mobile login screen yet.

## TikZ rendering fix (Skizze fell back to raw code)
Root causes:
1. siunitx NOT installed in sandbox -> any \SI/\qty/\si/\ang unit macro = fatal
   "Undefined control sequence" -> no PDF -> 422 -> raw-code fallback. Engineering
   tutor emits units constantly, so most figures with units broke.
2. pdflatex ran with -halt-on-error -> any minor/recoverable error killed the
   whole figure instead of best-efforting the rest.
Fixes (packages/web/src/api/lib/tikz.ts):
- PREAMBLE: \IfFileExists{siunitx.sty}{load+detect-all}{math-safe \providecommand
  fallbacks for \SI/\qty/\si/\num/\unit/\ang + common unit-word macros} -> portable
  (works even if a deploy has no siunitx).
- Dropped -halt-on-error (kept nonstopmode) -> best-effort PDF; only truly fatal
  errors leave no PDF (still surfaced as fallback).
- Also apt-installed texlive-science (siunitx) in sandbox for proper unit typesetting.
Verified live (:4200, cookie auth): units_SI + qty_ang render 200 w/ SVG (were 422);
screenshot Flansch/Steg figure still 200. Binaries present: pdflatex, dvisvgm.
