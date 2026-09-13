/**
 * L'inventaire des contrats — introduit en v0.1.
 *
 * L'onglet est le référentiel : c'est lui qui fait foi, pas le code. Une date
 * corrigée à la main y reste, un contrat ajouté à la main y vit aussi bien
 * qu'un contrat lu dans un PDF, et rien ici ne réécrit une décision humaine.
 * Le code ne touche qu'aux six colonnes calculées, qu'il recalcule en entier.
 */

const COLONNES_CONTRATS_ = [
  'Identifiant', 'Contrat', 'Fournisseur', 'Lien',
  'Date d’effet', 'Durée initiale (mois)', 'Reconduction (mois)',
  'Préavis', 'Unité du préavis', 'Montant annuel (€)', 'Responsable',
  'Origine des dates', 'Validé', 'Validé par', 'Validé le', 'Extrait justificatif', 'Lu le',
  'Prochaine échéance', 'Dénoncer avant le', 'Jours restants', 'État', 'Pourquoi',
  'Dénoncé le', 'Dernier rappel (jours)', 'Notes',
];

/** Les six que le code écrit. Toutes les autres appartiennent à l'utilisateur. */
const COLONNES_CALCULEES_ = [
  'Prochaine échéance', 'Dénoncer avant le', 'Jours restants', 'État', 'Pourquoi',
  'Validé le',
];

const ORIGINES_ = {
  modele: 'Lue par le modèle',
  main: 'Saisie à la main',
};

/**
 * Une ligne de l'onglet, telle que l'arithmétique la veut.
 *
 * `valide` est le point sensible. Une ligne saisie à la main est validée par
 * le fait même d'avoir été tapée : exiger une case en plus ferait cocher sans
 * lire, et une case qu'on coche sans lire ne protège de rien. Une ligne **lue
 * par le modèle**, elle, ne vaut rien tant qu'une personne ne l'a pas
 * confirmée — c'est toute la raison d'être de la colonne « Origine ».
 */
const contratDepuisLigne_ = (ligne, config) => {
  const origine = String(ligne['Origine des dates'] ?? '').trim();
  const coche = ligne['Validé'] === true || String(ligne['Validé']).toUpperCase() === 'VRAI';
  return {
    nom: String(ligne.Contrat ?? '').trim(),
    fournisseur: String(ligne.Fournisseur ?? '').trim(),
    responsable: String(ligne.Responsable ?? '').trim(),
    effet: SocleDates.jour(ligne['Date d’effet']),
    dureeInitiale: Number(ligne['Durée initiale (mois)']) || 0,
    reconduction: Number(ligne['Reconduction (mois)']) || 0,
    preavis: Number(ligne['Préavis']) || 0,
    unitePreavis: String(ligne['Unité du préavis'] ?? 'mois').trim() || 'mois',
    montant: Number(ligne['Montant annuel (€)']) || 0,
    denonceLe: SocleDates.jour(ligne['Dénoncé le']),
    valide: origine === ORIGINES_.modele ? coche : true,
    origine,
    seuilAlerteJours: config.seuilAlerteJours,
  };
};

const ecrireColonne_ = (table, nom, valeurs) => {
  if (!(nom in table.index) || valeurs.length === 0) return;
  table.feuille.getRange(2, table.index[nom] + 1, valeurs.length, 1)
    .setValues(valeurs.map((v) => [v]));
};

/**
 * Recalcule les colonnes dérivées de tout l'inventaire.
 *
 * Une écriture par colonne, et non par ligne : sur deux cents contrats, la
 * seconde version coûterait douze cents allers-retours vers Sheets et
 * dépasserait le plafond des six minutes bien avant d'avoir fini.
 */
const recalculerLesContrats_ = (aujourdhui, dejaComplete = false) => {
  const config = reglages_();
  let table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  // Un onglet né d'une version antérieure rattrape ses colonnes, une fois et
  // pas davantage : une récursion sans garde tournerait indéfiniment si
  // l'ajout échouait, et six minutes plus tard l'exécution serait tuée sans
  // que rien n'explique pourquoi.
  if (!dejaComplete && COLONNES_CONTRATS_.some((nom) => !(nom in table.index))) {
    SocleFeuilles.completerColonnes(ONGLET_CONTRATS_, COLONNES_CONTRATS_);
    table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  }

  const qui = SocleErreurs.absorber('identité indisponible',
    () => Session.getActiveUser().getEmail(), '');

  const colonnes = {};
  COLONNES_CALCULEES_.forEach((nom) => { colonnes[nom] = []; });
  const compte = {};

  table.lignes.forEach((ligne) => {
    const contrat = contratDepuisLigne_(ligne, config);
    const situation = situationDuContrat_(contrat, aujourdhui);
    compte[situation.etat] = (compte[situation.etat] || 0) + 1;

    colonnes['Prochaine échéance'].push(situation.echeance);
    colonnes['Dénoncer avant le'].push(situation.denoncerAvant);
    colonnes['Jours restants'].push(situation.joursRestants);
    colonnes['État'].push(situation.etat);
    colonnes['Pourquoi'].push(situation.pourquoi);

    // Qui a validé, et quand : une validation sans nom ne responsabilise
    // personne, et c'est une responsabilité qu'on prend en cochant.
    const dejaDate = SocleDates.jour(ligne['Validé le']);
    const validePar = String(ligne['Validé par'] ?? '').trim();
    colonnes['Validé le'].push(
      contrat.origine === ORIGINES_.modele && contrat.valide && dejaDate === ''
        ? SocleDates.maintenantJour()
        : dejaDate);
    if (contrat.origine === ORIGINES_.modele && contrat.valide && validePar === '' && qui) {
      table.feuille.getRange(ligne.numero, table.index['Validé par'] + 1).setValue(qui);
    }
  });

  COLONNES_CALCULEES_.forEach((nom) => ecrireColonne_(table, nom, colonnes[nom]));
  SpreadsheetApp.flush();
  return { contrats: table.lignes.length, parEtat: compte };
};

/** L'inventaire tel que les alertes le lisent — après recalcul, jamais avant. */
const lireLesContrats_ = (config) => {
  const table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  return table.lignes
    .map((ligne) => ({
      numero: ligne.numero,
      ligne,
      contrat: contratDepuisLigne_(ligne, config),
    }))
    .filter((entree) => entree.contrat.nom !== '');
};
