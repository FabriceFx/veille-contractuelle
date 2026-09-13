/**
 * Constantes, réglages et porte du modèle — introduit en v0.1.
 *
 * Tous les noms globaux de ce projet portent un suffixe `_` ou un préfixe
 * explicite : deux constantes globales de même nom entre deux fichiers
 * empêchent le projet **entier** de se charger, et toutes ses fonctions
 * deviennent introuvables d'un coup.
 */

const VERSION_ = '0.1.0';

const ONGLET_CONTRATS_ = 'Contrats';
const ONGLET_ALERTES_ = 'Alertes';
const ONGLET_REGLAGES_ = 'Réglages';
const ONGLET_ECARTES_ = 'Documents écartés';
const ONGLET_GUIDE_ = 'Guide';

const CLE_SECRET_GEMINI_ = 'CLE_GEMINI';

const MODES_MODELE_ = {
  vertex: 'Vertex AI (projet Cloud)',
  aiStudio: 'Clé AI Studio',
};

const CLES_ = {
  dossier: 'Dossier des contrats (lien Drive)',
  mode: 'Appel au modèle',
  projetCloud: 'Projet Cloud (pour Vertex)',
  region: 'Région Vertex',
  modele: 'Modèle',
  rappels: 'Rappels à (jours avant la date limite)',
  destinataire: 'Destinataire par défaut des alertes',
  taillePdfMax: 'Taille maximale d’un PDF (Mo)',
};

const DEFAUTS_ = {
  [CLES_.mode]: MODES_MODELE_.vertex,
  [CLES_.projetCloud]: '',
  [CLES_.region]: 'europe-west1',
  [CLES_.modele]: 'gemini-2.5-flash',
  [CLES_.rappels]: '90, 60, 30, 7',
  [CLES_.destinataire]: '',
  [CLES_.taillePdfMax]: '15',
};

const declarerLesSecrets_ = () => {
  SocleSecrets.declarer(CLE_SECRET_GEMINI_, {
    portee: 'partagee',
    description: 'Clé de l’API Gemini AI Studio. Inutile en mode Vertex : c’est '
      + 'alors le jeton OAuth de la personne qui exécute qui sert.',
  });
};

/**
 * Les rappels, du plus lointain au plus proche.
 *
 * Une saisie fautive ne doit pas faire taire la veille : on garde ce qui est
 * lisible, et le reste est ignoré plutôt que de faire échouer l'exécution.
 */
const rappelsDepuis_ = (texte) => {
  const jours = String(texte ?? '')
    .split(/[,;]/)
    .map((part) => Number(String(part).trim()))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => b - a);
  return jours.length ? jours : [90, 60, 30, 7];
};

const reglages_ = () => {
  const lus = SocleFeuilles.lireReglages(ONGLET_REGLAGES_);
  const valeur = (cle) => String(lus[cle] ?? '').trim();
  const rappels = rappelsDepuis_(valeur(CLES_.rappels));
  return {
    dossier: valeur(CLES_.dossier),
    mode: valeur(CLES_.mode) === MODES_MODELE_.aiStudio
      ? MODES_MODELE_.aiStudio : MODES_MODELE_.vertex,
    projetCloud: valeur(CLES_.projetCloud),
    region: valeur(CLES_.region) || 'europe-west1',
    modele: valeur(CLES_.modele) || 'gemini-2.5-flash',
    rappels,
    // Le premier rappel donne le seuil à partir duquel l'état d'un contrat
    // passe de « à surveiller » à « fenêtre ouverte ».
    seuilAlerteJours: rappels[0],
    destinataire: valeur(CLES_.destinataire),
    taillePdfMaxOctets: (Number(valeur(CLES_.taillePdfMax)) || 15) * 1024 * 1024,
  };
};

/**
 * L'identifiant Drive, qu'on ait collé une URL ou l'identifiant seul.
 *
 * Le repli rend le texte tel quel plutôt qu'une chaîne vide : un identifiant
 * collé nu est le cas normal, et le refuser produirait un « dossier illisible »
 * incompréhensible pour qui a justement collé la bonne chose.
 */
const idDepuisLien_ = (lienOuId) => {
  const texte = String(lienOuId ?? '').trim();
  const trouve = /[-\w]{25,}/.exec(texte);
  return trouve ? trouve[0] : texte;
};

/**
 * La seule porte vers le modèle, et elle a deux battants.
 *
 * **Vertex** appelle Gemini depuis le projet Cloud du client, avec le jeton
 * OAuth de la personne qui exécute : le contrat ne quitte pas le périmètre
 * contractuel Google Cloud de l'entreprise. **AI Studio** est plus simple à
 * installer — une clé, rien d'autre — mais les documents envoyés sortent de ce
 * périmètre. Sur des contrats commerciaux, ce n'est pas un détail de
 * configuration : c'est la question à poser au juridique avant d'installer.
 *
 * Les deux battants partagent le corps de requête, qui est le même format.
 */
const interrogerLeModele_ = ({ invite, pieces, schema, config }) => {
  const charge = {
    contents: [{ role: 'user', parts: [{ text: invite }, ...pieces] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0,
    },
  };

  const vertex = config.mode === MODES_MODELE_.vertex;
  if (vertex && config.projetCloud === '') {
    throw SocleErreurs.erreur({
      quoi: 'Le mode Vertex demande un projet Cloud, et aucun n’est indiqué.',
      quoiFaire: `Renseignez « ${CLES_.projetCloud} » dans l’onglet « ${ONGLET_REGLAGES_} », `
        + 'ou basculez le mode sur la clé AI Studio en sachant que les contrats '
        + 'sortiront alors du périmètre contractuel de votre projet Cloud.',
    });
  }

  const url = vertex
    ? `https://${config.region}-aiplatform.googleapis.com/v1/projects/`
      + `${config.projetCloud}/locations/${config.region}/publishers/google/models/`
      + `${config.modele}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${config.modele}:generateContent`;

  // La clé ne passe JAMAIS par l'URL : une URL se retrouve dans les journaux
  // d'exécution, dans les journaux du proxy, et dans la barre d'adresse de qui
  // débogue. L'en-tête, non.
  const entetes = vertex
    ? { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }
    : { 'x-goog-api-key': SocleSecrets.lire(CLE_SECRET_GEMINI_) };

  const reponse = SocleReprises.appelHttp(url, {
    method: 'post',
    contentType: 'application/json',
    headers: entetes,
    payload: JSON.stringify(charge),
  });

  const corps = JSON.parse(reponse.getContentText());
  const texte = (((corps.candidates || [])[0] || {}).content || {}).parts || [];
  const brut = texte.map((part) => part.text || '').join('').trim();
  if (brut === '') {
    throw SocleErreurs.erreur({
      quoi: 'Le modèle n’a rien renvoyé d’exploitable.',
      quoiFaire: 'Réessayez ; si cela persiste, vérifiez le nom du modèle dans les réglages.',
    });
  }
  return JSON.parse(brut);
};
