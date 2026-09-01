# Dix langues côté serveur

Voilà pourquoi « les langues ne fonctionnent pas ».

## Le défaut

Il y avait **deux tables de langues** dans ton code, et aucune ne couvrait ce
que ton interface propose :

| Table | Utilisée par | Couvrait |
|---|---|---|
| `LANG_LABEL` (agent) | le chat | de, fr, en |
| `EX_LANG` (index) | exercices, Klausuren, formulaires | de, fr, en |

Ton interface propose **dix** langues.

Le code faisait littéralement ceci :

```ts
const locale = EX_LANG[body.locale ?? ""] ? body.locale : "de";
```

Un étudiant choisit l'espagnol → `EX_LANG["es"]` vaut `undefined` → le code
bascule **explicitement en allemand**. Sans message, sans trace. Sept de tes
dix langues ne pouvaient donc pas fonctionner sur les exercices, les Klausuren
et les formulaires — quoi que je corrige ailleurs.

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-langues.zip" -C .
node patch-langues.mjs
bun run verify
git add -A && git commit -m "dix langues cote serveur" && git push
```

Le script te dira quelles langues ton interface propose et si toutes sont
couvertes.

## Ce que ça change

**Une seule table**, `lib/languages.ts`, utilisée par le chat, les exercices,
les Klausuren et les formulaires. Deux tables qui doivent rester d'accord
finissent toujours par diverger ; il n'y en a plus qu'une.

**Quinze langues** couvertes : de, en, fr, es, it, pt, nl, pl, tr, ru, uk, ar,
zh, ro, cs.

**La consigne est écrite dans la langue.** Pour l'espagnol, le prompt commence
par `REGLA DE IDIOMA — TIENE PRIORIDAD SOBRE TODO LO DEMÁS`. C'est la seule
chose qui fait vraiment basculer un modèle noyé sous cinq cents lignes
d'allemand.

**Le repli ne ment plus.** Une langue inconnue produit une consigne qui la
nomme par son code, au lieu de retomber en allemand en silence. Un repli
silencieux est pire qu'une erreur : personne ne peut le signaler.

**`pt-BR` trouve `pt`**, `" EN "` trouve `en`. Les codes régionaux et les
espaces ne cassent plus rien.

## Si une de tes langues manque

Le script te le dira. Elle fonctionnera quand même — avec une consigne rédigée
en anglais qui nomme le code. Envoie-moi la liste et j'écris les phrases dans
ces langues : c'est ce qui fait la différence.
