/**
 * L'arithmétique des échéances — introduite en v0.1.
 *
 * Tout le produit tient dans ce fichier : le reste lit des cellules, appelle un
 * modèle ou envoie du courrier. Ici se décide la seule chose qui coûte de
 * l'argent quand elle est fausse — la date après laquelle un contrat est
 * reconduit pour un an de plus.
 *
 * Trois conventions, écrites plutôt que sous-entendues, parce qu'elles ne se
 * devinent pas en lisant le résultat :
 *
 * 1. **L'échéance est la date de reconduction**, non le dernier jour de la
 *    période. Un contrat qui prend effet le 1er mars pour douze mois court
 *    jusqu'au 28 février et se reconduit le **1er mars** suivant. C'est cette
 *    date-là qui figure au tableau.
 * 2. **Le dernier jour pour dénoncer est `échéance − préavis`**, ce jour-là
 *    compris : un préavis « de trois mois » posé le 1er décembre pour une
 *    échéance au 1er mars est réputé tenu. Un contrat qui exige « plus de
 *    trois mois » se règle en portant le préavis à quatre, ou en le notant.
 * 3. **Ajouter des mois ne déborde jamais sur le mois suivant.** Le 31 janvier
 *    plus un mois vaut le 28 février, non le 3 mars. `Date.setMonth` fait
 *    l'inverse, en silence, et décale toutes les échéances d'un contrat signé
 *    un 29, 30 ou 31.
 */

/** Le préavis s'exprime dans l'une ou l'autre unité ; les contrats font les deux. */
const UNITES_PREAVIS_ = ['mois', 'jours'];

const ETATS_CONTRAT_ = {
  aValider: 'À valider',
  incomplet: 'Incomplet',
  sansReconduction: 'Sans reconduction',
  aSurveiller: 'À surveiller',
  fenetreOuverte: 'Fenêtre ouverte',
  denonce: 'Dénoncé',
};

/**
 * Ajoute des mois à une date `yyyy-MM-dd`, en bornant au dernier jour du mois
 * d'arrivée.
 *
 * Le calcul passe par `Date.UTC` : en heure locale, un changement d'heure entre
 * les deux dates décale le résultat d'un jour dans un sens ou dans l'autre,
 * ce qui suffit à faire manquer un préavis d'une journée.
 */
const ajouterMois_ = (jour, mois) => {
  const [annee, mo, jo] = String(jour).split('-').map(Number);
  const visee = new Date(Date.UTC(annee, (mo - 1) + mois, 1));
  const dernierDuMois = new Date(Date.UTC(
    visee.getUTCFullYear(), visee.getUTCMonth() + 1, 0)).getUTCDate();
  const resultat = new Date(Date.UTC(
    visee.getUTCFullYear(), visee.getUTCMonth(), Math.min(jo, dernierDuMois)));
  return SocleDates.jour(resultat);
};

const ajouterJours_ = (jour, jours) => {
  const [annee, mo, jo] = String(jour).split('-').map(Number);
  return SocleDates.jour(new Date(Date.UTC(annee, mo - 1, jo + jours)));
};

const retirerPreavis_ = (jour, preavis, unite) => (unite === 'jours'
  ? ajouterJours_(jour, -preavis)
  : ajouterMois_(jour, -preavis));

/**
 * Tout ce qu'on peut dire d'un contrat à une date donnée.
 *
 * Rend **deux** dates, et c'est délibéré. `echeance` est la prochaine
 * reconduction, qu'on puisse encore l'empêcher ou non ; `denoncerAvant` est le
 * dernier jour de la prochaine fenêtre **encore ouverte**. Les confondre
 * produit l'erreur la plus chère du domaine : afficher une échéance dont le
 * préavis est déjà passé donne à croire qu'on peut encore agir.
 *
 * `aujourdhui` est un paramètre et non `new Date()` : une fonction de date qui
 * lit l'horloge ne se teste pas, et c'est exactement celle qu'il faut tester.
 */
const situationDuContrat_ = (contrat, aujourdhui) => {
  const vide = {
    echeance: '', echeanceAcquise: false, denoncerAvant: '', echeanceVisee: '',
    joursRestants: '', etat: ETATS_CONTRAT_.incomplet, pourquoi: '',
  };

  if (contrat.denonceLe) {
    return { ...vide, etat: ETATS_CONTRAT_.denonce, pourquoi: `dénoncé le ${contrat.denonceLe}` };
  }

  // Une date présumée par le modèle ne produit AUCUNE échéance. C'est la règle
  // qui tient tout le produit : une présomption affichée dans la colonne d'un
  // fait devient un fait au bout de trois jours, et l'on dénonce — ou pas — sur
  // la foi d'une lecture automatique que personne n'a vérifiée.
  if (!contrat.valide) {
    return { ...vide, etat: ETATS_CONTRAT_.aValider,
      pourquoi: 'dates lues automatiquement, pas encore validées par une personne' };
  }

  if (!contrat.effet || !(contrat.dureeInitiale > 0)) {
    return { ...vide, pourquoi: 'il manque la date d’effet ou la durée initiale' };
  }
  if (!UNITES_PREAVIS_.includes(contrat.unitePreavis)) {
    return { ...vide, pourquoi: `unité de préavis inconnue : « ${contrat.unitePreavis} »` };
  }

  const terme = ajouterMois_(contrat.effet, contrat.dureeInitiale);

  // Sans reconduction, il y a un terme mais rien à empêcher : le contrat
  // s'arrête tout seul. Le dire plutôt que d'afficher une fenêtre vide.
  if (!(contrat.reconduction > 0)) {
    return { ...vide, echeance: terme, etat: ETATS_CONTRAT_.sansReconduction,
      pourquoi: 'pas de tacite reconduction — le contrat s’arrête à son terme' };
  }

  // La prochaine reconduction : on avance de période en période jusqu'à
  // dépasser aujourd'hui. Le pas est borné — un contrat de 1990 avec une
  // reconduction mensuelle fait quelques centaines de tours, pas davantage.
  let echeance = terme;
  let gardeFou = 0;
  while (echeance <= aujourdhui && gardeFou < 1200) {
    echeance = ajouterMois_(echeance, contrat.reconduction);
    gardeFou += 1;
  }

  // Puis la première échéance dont le préavis n'est pas encore expiré. Ce
  // n'est pas toujours celle d'au-dessus : quand le préavis vient de passer,
  // la reconduction qui vient est acquise et l'occasion suivante est un an
  // plus loin. C'est précisément ce qu'un tableau naïf ne dit pas.
  let visee = echeance;
  let limite = retirerPreavis_(visee, contrat.preavis, contrat.unitePreavis);
  let tours = 0;
  while (limite < aujourdhui && tours < 1200) {
    visee = ajouterMois_(visee, contrat.reconduction);
    limite = retirerPreavis_(visee, contrat.preavis, contrat.unitePreavis);
    tours += 1;
  }

  const joursRestants = SocleDates.ecartEnJours(aujourdhui, limite);
  return {
    echeance,
    echeanceAcquise: visee !== echeance,
    denoncerAvant: limite,
    echeanceVisee: visee,
    joursRestants,
    etat: joursRestants <= contrat.seuilAlerteJours
      ? ETATS_CONTRAT_.fenetreOuverte
      : ETATS_CONTRAT_.aSurveiller,
    pourquoi: visee === echeance
      ? ''
      : `le préavis de l’échéance du ${echeance} est passé : elle est acquise`,
  };
};
