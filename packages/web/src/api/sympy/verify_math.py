#!/usr/bin/env python3
"""Vérifie une égalité mathématique écrite en LaTeX, avec SymPy.

Lancé par le serveur (api/lib/sympy-verify.ts) dans un sous-processus :

    echo '{"latex": "\\\\int_0^1 x^2 dx = \\\\frac{1}{3}"}' | python -I -B verify_math.py

Entrée  : UNE ligne JSON sur l'entrée standard, {"latex": "..."}.
Sortie  : UNE ligne JSON sur la sortie standard,
          {"is_valid": true, "result": "\\\\frac{1}{3}", "reason": "equal", "engine": "sympy", "version": "…"}

  is_valid  vrai seulement si l'expression est une égalité (« a = b », ou une
            chaîne « a = b = c ») que SymPy a DÉMONTRÉE. Une expression sans
            « = » est seulement calculée : is_valid reste faux.
  result    la valeur que SymPy trouve pour le membre de gauche, en LaTeX.
  reason    equal | not_equal | undecided | no_claim | parse_error | too_long | error

── Sécurité ────────────────────────────────────────────────────────────────
Ce programme lit du texte venu d'un modèle de langage, donc d'un étudiant.
  · Aucun `eval`, aucun `sympify` sur une chaîne : le LaTeX passe par
    l'analyseur syntaxique de SymPy (grammaire ANTLR), qui ne construit que
    des objets mathématiques.
  · Lancé en racine, il quitte ce compte pour « nobody » avant de lire quoi
    que ce soit : il ne peut plus lire l'environnement du serveur.
  · Limites du noyau : temps de calcul, mémoire, 64 Ko écrits au plus.
  · Un crochet d'audit refuse, une fois SymPy chargé, toute ouverture de
    fichier hors des bibliothèques Python, tout processus, tout réseau.
Le délai strict est tenu par le serveur, qui tue le processus (3 s en tout :
environ 0,9 s pour charger SymPy, puis 2 s de calcul au plus).
"""

import json
import os
import sys

MAX_LATEX = 600
MAX_RESULT = 400
CPU_SECONDS = 2
MEMORY_BYTES = 1024 * 1024 * 1024


def reply(**fields):
    sys.stdout.write(json.dumps(fields, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def drop_privileges():
    """En racine (conteneur) : devenir « nobody ». Sans effet ailleurs."""
    try:
        if os.geteuid() == 0:
            os.setgroups([])
            os.setgid(65534)
            os.setuid(65534)
    except (AttributeError, OSError):
        pass


def kernel_limits():
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
        # 64 Ko : de quoi écrire la réponse si la sortie standard est un fichier ; rien de plus.
        resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:  # Windows (essais locaux) : pas de module resource
        pass


FORBIDDEN = (
    "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.fork", "os.forkpty", "os.kill", "os.putenv",
    "os.remove", "os.rename", "os.rmdir", "os.mkdir", "os.chmod", "os.chown", "os.symlink", "os.link", "os.truncate",
    "subprocess.", "socket.", "shutil.", "ctypes.", "webbrowser.", "urllib.", "http.", "ftplib.", "smtplib.", "pty.",
    "winreg.", "msvcrt.", "os.startfile",
)


def limit_computation():
    """Le chargement de SymPy est fait : le CALCUL, lui, a droit à CPU_SECONDS."""
    try:
        import math
        import resource

        used = resource.getrusage(resource.RUSAGE_SELF)
        budget = math.ceil(used.ru_utime + used.ru_stime) + CPU_SECONDS
        resource.setrlimit(resource.RLIMIT_CPU, (budget, budget))
    except Exception:
        pass


def install_audit_hook():
    """Après le chargement de SymPy : plus rien d'autre que du calcul."""
    roots = set()
    for base in (sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix, *sys.path):
        if base:
            roots.add(os.path.realpath(base))
    roots = tuple(sorted(roots))

    def inside_python(path):
        if isinstance(path, int):  # descripteur déjà ouvert (entrée / sortie standard)
            return path in (0, 1, 2)
        try:
            real = os.path.realpath(os.fsdecode(path))
        except Exception:
            return False
        return any(real == root or real.startswith(root + os.sep) for root in roots)

    def hook(event, args):
        if event.startswith(FORBIDDEN):
            raise PermissionError("interdit : " + event)
        if event == "open":
            path, mode, flags = (list(args) + [None, None, None])[:3]
            writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or (isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if writing or not inside_python(path):
                raise PermissionError("interdit : ouverture de fichier")
        elif event in ("os.listdir", "os.scandir"):
            if args and args[0] is not None and not inside_python(args[0]):
                raise PermissionError("interdit : lecture de dossier")

    sys.addaudithook(hook)


def split_equalities(latex):
    """Coupe sur les « = » hors accolades (le « i=1 » d'une somme reste entier)."""
    parts, depth, current = [], 0, []
    i = 0
    while i < len(latex):
        ch = latex[i]
        if ch == "\\" and i + 1 < len(latex):
            current.append(latex[i : i + 2])
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        if ch == "=" and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
        i += 1
    parts.append("".join(current).strip())
    return parts


def main():
    drop_privileges()
    kernel_limits()

    try:
        # `--self-test` : l'égalité de contrôle, sans rien lire (construction de l'image, CI).
        raw = '{"latex": "\\\\int_0^1 x^2 dx = \\\\frac{1}{3}"}' if "--self-test" in sys.argv[1:] else sys.stdin.read(16384)
        request = json.loads(raw)
        latex = request["latex"]
        if not isinstance(latex, str):
            raise ValueError
    except Exception:
        return reply(is_valid=False, result="", reason="parse_error", engine="sympy")
    latex = latex.strip()
    if not latex or len(latex) > MAX_LATEX:
        return reply(is_valid=False, result="", reason="too_long" if latex else "parse_error", engine="sympy")

    import sympy
    from sympy import E, Derivative, Integral, Symbol, latex as to_latex, simplify
    from sympy.parsing.latex import parse_latex

    # Un premier passage charge la grammaire et les modules paresseux, puis on ferme la porte.
    try:
        parse_latex("\\int_0^1 x^2 dx").doit()
    except Exception:
        return reply(is_valid=False, result="", reason="error", engine="sympy", version=sympy.__version__)
    limit_computation()
    install_audit_hook()

    def parse(source):
        expr = parse_latex(source)
        e = Symbol("e")
        if e in expr.free_symbols:  # le « e » d'une formule est le nombre d'Euler
            expr = expr.subs(e, E)
        return expr

    def shown(expr):
        return to_latex(expr)[:MAX_RESULT]

    try:
        sides = split_equalities(latex)
        if any(not s for s in sides):
            return reply(is_valid=False, result="", reason="parse_error", engine="sympy", version=sympy.__version__)
        parsed = [parse(s) for s in sides]
        values = [simplify(p.doit()) for p in parsed]
        result = shown(values[0])

        if len(sides) == 1:
            return reply(is_valid=False, result=result, reason="no_claim", engine="sympy", version=sympy.__version__)

        verdict = "equal"
        for i in range(len(values) - 1):
            left, right = values[i], values[i + 1]
            # Primitive : égale à une constante près — on compare les dérivées.
            open_integral = [a for a in parsed[i].atoms(Integral) if all(len(lim) == 1 for lim in a.limits)]
            if open_integral and not parsed[i].atoms(Derivative):
                variable = open_integral[0].limits[0][0]
                difference = simplify(sympy.diff(left - right, variable))
            else:
                difference = simplify(left - right)
            if difference == 0:
                continue
            same = difference.equals(0)
            if same is True:
                continue
            verdict = "not_equal" if same is False else "undecided"
            break
        reply(is_valid=verdict == "equal", result=result, reason=verdict, engine="sympy", version=sympy.__version__)
    except PermissionError:
        reply(is_valid=False, result="", reason="error", engine="sympy", version=sympy.__version__)
    except MemoryError:
        reply(is_valid=False, result="", reason="error", engine="sympy", version=sympy.__version__)
    except Exception:
        reply(is_valid=False, result="", reason="parse_error", engine="sympy", version=sympy.__version__)


if __name__ == "__main__":
    main()
