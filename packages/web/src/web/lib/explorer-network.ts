import type { ExplorerModel, LocalText } from "./explorer-models";

/**
 * Informatik (19 nov. 2026) : une architecture web classique, en trois
 * couches — des clients, un pare-feu, un répartiteur de charge, deux serveurs
 * d'application et UNE base de données. Le défaut est voulu : la base unique
 * est le point de défaillance unique (Single Point of Failure) que le
 * « 3D Detective » fait chercher.
 *
 * Textes écrits et relus, en 4 langues ; la scène est construite à partir de
 * formes simples (components/explorer-scenes.tsx, `Network`).
 */
const L = (de: string, en: string, fr: string, es: string): LocalText => ({ de, en, fr, es });

/** Où chaque bloc est posé (x, z) et sa hauteur : partagé par les repères et la scène. */
export const NETWORK_NODES = {
  clients: { x: -3.1, z: 0, h: 0.5, w: 0.55 },
  firewall: { x: -1.75, z: 0, h: 1.0, w: 0.35 },
  balancer: { x: -0.45, z: 0, h: 0.55, w: 0.8 },
  app: { x: 0.95, z: 0, h: 0.95, w: 0.6 },
  database: { x: 2.55, z: 0, h: 1.05, w: 0.75 },
} as const;
/** Les deux serveurs d'application, de part et d'autre de l'axe. */
export const APP_Z = [-0.85, 0.85] as const;
const top = (id: keyof typeof NETWORK_NODES, z = 0): [number, number, number] => [NETWORK_NODES[id].x, NETWORK_NODES[id].h + 0.25, z];

export const NETWORK: ExplorerModel = {
  id: "network",
  discipline: "informatics",
  keywords: ["load ?balancer", "lastverteil", "single point of failure", "\\bspof\\b", "firewall", "pare-feu", "cortafuegos", "client-server", "client-serveur", "drei-schicht", "three-tier", "datenbankserver", "répartiteur de charge"],
  name: L("Web-Architektur", "Web architecture", "Architecture web", "Arquitectura web"),
  intro: L(
    "Eine typische Drei-Schichten-Architektur: Anfragen kommen von den Clients, laufen durch die Firewall zum Load Balancer, der sie auf zwei App-Server verteilt – und beide nutzen dieselbe Datenbank. Tippe auf einen Baustein.",
    "A typical three-tier architecture: requests come from the clients, pass the firewall to the load balancer, which spreads them over two app servers – and both use the same database. Tap a component.",
    "Une architecture trois tiers classique : les requêtes partent des clients, passent le pare-feu jusqu'au répartiteur de charge, qui les distribue sur deux serveurs d'application – et tous deux utilisent la même base de données. Touche un composant.",
    "Una arquitectura típica de tres capas: las peticiones salen de los clientes, pasan el cortafuegos hasta el balanceador de carga, que las reparte entre dos servidores de aplicación, y ambos usan la misma base de datos. Toca un componente.",
  ),
  bounds: { min: [-3.6, -0.1, -1.6], max: [3.2, 1.5, 1.6] },
  camera: [1.6, 3.4, 6.6],
  hotspots: [
    {
      id: "clients",
      position: top("clients"),
      title: L("Clients", "Clients", "Clients", "Clientes"),
      text: L(
        "Browser und Apps der Nutzer. Sie schicken HTTP-Anfragen und kennen nur eine Adresse – die des Load Balancers hinter der Firewall, nie die einzelnen Server.",
        "The users' browsers and apps. They send HTTP requests and know only one address – the load balancer's behind the firewall, never the individual servers.",
        "Les navigateurs et applications des utilisateurs. Ils envoient des requêtes HTTP et ne connaissent qu'une adresse – celle du répartiteur derrière le pare-feu, jamais les serveurs eux-mêmes.",
        "Los navegadores y apps de los usuarios. Envían peticiones HTTP y solo conocen una dirección: la del balanceador tras el cortafuegos, nunca los servidores concretos.",
      ),
      fact: L("Zustandslose Anfragen (HTTP) machen das Verteilen erst möglich.", "Stateless requests (HTTP) are what make spreading the load possible.", "Ce sont les requêtes sans état (HTTP) qui permettent de répartir la charge.", "Las peticiones sin estado (HTTP) son las que permiten repartir la carga."),
      quiz: L("Wo entstehen die Anfragen, die das System beantworten muss?", "Where do the requests the system has to answer come from?", "D'où viennent les requêtes auxquelles le système doit répondre ?", "¿De dónde vienen las peticiones que el sistema debe responder?"),
    },
    {
      id: "firewall",
      position: top("firewall"),
      title: L("Firewall", "Firewall", "Pare-feu", "Cortafuegos"),
      text: L(
        "Filtert den Verkehr zwischen Internet und internem Netz: Nur erlaubte Ports (etwa 443 für HTTPS) kommen durch. Alles andere wird verworfen, bevor es einen Server erreicht.",
        "Filters traffic between the internet and the internal network: only allowed ports (such as 443 for HTTPS) get through. Everything else is dropped before it reaches a server.",
        "Filtre le trafic entre Internet et le réseau interne : seuls les ports autorisés (par exemple 443 pour HTTPS) passent. Le reste est rejeté avant d'atteindre un serveur.",
        "Filtra el tráfico entre internet y la red interna: solo pasan los puertos permitidos (por ejemplo, el 443 para HTTPS). Todo lo demás se descarta antes de llegar a un servidor.",
      ),
      fact: L("Prinzip: alles verbieten, was nicht ausdrücklich erlaubt ist (Default Deny).", "Principle: deny everything that isn't explicitly allowed (default deny).", "Principe : tout interdire sauf ce qui est explicitement autorisé (default deny).", "Principio: prohibir todo lo que no esté permitido expresamente (default deny)."),
      quiz: L("Welcher Baustein lässt nur erlaubte Ports ins interne Netz?", "Which component lets only allowed ports into the internal network?", "Quel composant ne laisse entrer que les ports autorisés dans le réseau interne ?", "¿Qué componente deja pasar a la red interna solo los puertos permitidos?"),
    },
    {
      id: "balancer",
      position: top("balancer"),
      title: L("Load Balancer", "Load balancer", "Répartiteur de charge", "Balanceador de carga"),
      text: L(
        "Verteilt die Anfragen auf die App-Server (etwa reihum oder nach Auslastung) und prüft regelmäßig, ob sie antworten. Fällt ein App-Server aus, schickt er ihm einfach nichts mehr.",
        "Spreads the requests over the app servers (for example round-robin or by load) and checks regularly that they answer. If an app server fails, it simply stops sending it traffic.",
        "Répartit les requêtes entre les serveurs d'application (à tour de rôle ou selon la charge) et vérifie régulièrement qu'ils répondent. Si l'un tombe, il ne lui envoie plus rien.",
        "Reparte las peticiones entre los servidores de aplicación (por turnos o según la carga) y comprueba con regularidad que responden. Si uno falla, deja de enviarle tráfico.",
      ),
      fact: L("Health Checks machen die App-Schicht ausfallsicher – nicht die Datenbank.", "Health checks make the app tier fault-tolerant – not the database.", "Les contrôles de santé rendent la couche applicative tolérante aux pannes – pas la base de données.", "Los health checks hacen tolerante a fallos la capa de aplicación, no la base de datos."),
      quiz: L("Welcher Baustein verteilt die Anfragen auf mehrere Server?", "Which component spreads the requests over several servers?", "Quel composant répartit les requêtes entre plusieurs serveurs ?", "¿Qué componente reparte las peticiones entre varios servidores?"),
    },
    {
      id: "app",
      position: top("app", APP_Z[0]),
      title: L("App-Server", "App servers", "Serveurs d'application", "Servidores de aplicación"),
      text: L(
        "Zwei gleiche Server führen die Anwendungslogik aus. Weil sie keinen eigenen Zustand speichern, ist einer ersetzbar: Fällt er aus, übernimmt der andere – horizontale Skalierung.",
        "Two identical servers run the application logic. Because they keep no state of their own, either can be replaced: if one fails, the other takes over – horizontal scaling.",
        "Deux serveurs identiques exécutent la logique de l'application. Comme ils ne gardent aucun état propre, chacun est remplaçable : si l'un tombe, l'autre prend le relais – mise à l'échelle horizontale.",
        "Dos servidores iguales ejecutan la lógica de la aplicación. Como no guardan estado propio, cualquiera es sustituible: si uno falla, el otro toma el relevo (escalado horizontal).",
      ),
      fact: L("Verfügbarkeit zweier unabhängiger Server: 1 − (1 − p)².", "Availability of two independent servers: 1 − (1 − p)².", "Disponibilité de deux serveurs indépendants : 1 − (1 − p)².", "Disponibilidad de dos servidores independientes: 1 − (1 − p)²."),
      quiz: L("Welche Bausteine führen die Anwendungslogik doppelt aus?", "Which components run the application logic twice over?", "Quels composants exécutent la logique de l'application en double ?", "¿Qué componentes ejecutan la lógica de la aplicación por duplicado?"),
    },
    {
      id: "database",
      position: top("database"),
      title: L("Datenbank (Single Point of Failure)", "Database (single point of failure)", "Base de données (point de défaillance unique)", "Base de datos (punto único de fallo)"),
      text: L(
        "Es gibt sie nur einmal, und beide App-Server hängen an ihr: Fällt sie aus, steht das ganze System – egal wie viele App-Server laufen. Abhilfe: Replikation (Primary/Replica) mit automatischem Failover.",
        "There is only one, and both app servers depend on it: if it fails, the whole system stops – however many app servers are running. Remedy: replication (primary/replica) with automatic failover.",
        "Elle n'existe qu'une fois, et les deux serveurs d'application en dépendent : si elle tombe, tout le système s'arrête, quel que soit le nombre de serveurs. Remède : réplication (primaire/réplique) avec bascule automatique.",
        "Solo hay una y los dos servidores de aplicación dependen de ella: si falla, todo el sistema se detiene, da igual cuántos servidores funcionen. Solución: replicación (primaria/réplica) con conmutación automática.",
      ),
      fact: L("Ein System ist nur so verfügbar wie sein schwächstes nicht redundantes Glied.", "A system is only as available as its weakest non-redundant link.", "Un système n'est disponible qu'autant que son maillon non redondant le plus faible.", "Un sistema solo es tan disponible como su eslabón no redundante más débil."),
      quiz: L("Welcher Baustein ist der Single Point of Failure?", "Which component is the single point of failure?", "Quel composant est le point de défaillance unique ?", "¿Qué componente es el punto único de fallo?"),
    },
  ],
};
