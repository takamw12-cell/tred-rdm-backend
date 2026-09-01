# Durcissement

La mémoire du tuteur ne peut plus faire tomber le chat.

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-solide.zip" -C .
node patch-solide.mjs
bun run verify
git add -A && git commit -m "memoire non bloquante" && git push
```

## Pourquoi

Tu as poussé le code de la mémoire. S'il tourne sur Railway **sans que la table
`misconception` existe**, chaque message du chat lève une exception dans
`openGaps()` — et `/api/agent/messages` répond une erreur. Le chat entier
tombe, à cause d'un supplément.

`lib/memory.ts` est désormais enveloppé : à la première erreur, la mémoire se
désactive pour l'instance, écrit une ligne dans les journaux Railway, et le
tuteur repart **exactement comme avant cette livraison**. Rien ne casse.

C'est la règle générale : une fonction de confort ne doit jamais pouvoir
emporter la fonction principale.

## Aussi

`.gitignore` ignore désormais les `*.bak`. Ton dernier envoi en a embarqué
dix-sept sur GitHub. Pour les retirer du dépôt sans les effacer de ton disque :

```
git rm --cached -r --quiet "*.bak"
```

## Ça ne remplace pas la migration

Le durcissement empêche la casse ; il ne crée pas la table. Pour que la mémoire
fonctionne vraiment :

```
bun --env-file=.env migration-memoire.mjs
```
