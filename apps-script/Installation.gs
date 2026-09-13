/**
 * Installation des onglets — introduite en v0.1.
 *
 * N'ajoute que ce qui manque et ne réécrit jamais une valeur déjà renseignée :
 * le référentiel vit dans les onglets, et le code n'y a pas d'avis.
 */

const contraindreLaSaisie_ = () => {
  SocleFeuilles.listeSurReglage(ONGLET_REGLAGES_, CLES_.mode,
    [MODES_MODELE_.vertex, MODES_MODELE_.aiStudio]);
  SocleFeuilles.nombreSurReglage(ONGLET_REGLAGES_, CLES_.taillePdfMax, 1, 20);
  SocleFeuilles.listeSurColonne(ONGLET_CONTRATS_, 'Unité du préavis', UNITES_PREAVIS_);
  SocleFeuilles.listeSurColonne(ONGLET_CONTRATS_, 'Origine des dates',
    [ORIGINES_.modele, ORIGINES_.main]);

  // La case à cocher, plutôt qu'un « oui » tapé à la main : on voit d'un coup
  // d'œil, sur deux cents lignes, ce qui est validé et ce qui ne l'est pas.
  const table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  if (!('Validé' in table.index)) return;
  const hauteur = Math.max(table.feuille.getMaxRows() - 1, 1);
  table.feuille.getRange(2, table.index['Validé'] + 1, hauteur, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
};

const LIGNES_DU_GUIDE_ = () => [
  [`Veille contractuelle — version ${VERSION_}`, ''],
  ['Ce que fait l’outil',
    'Il tient l’inventaire de vos contrats, calcule la date après laquelle chacun se '
    + 'reconduit tacitement, et alerte avant qu’il soit trop tard. Il peut aussi lire '
    + 'les contrats d’un dossier Drive pour proposer ces dates — mais il ne les tient '
    + 'jamais pour acquises.'],
  ['La règle qui gouverne tout',
    'Une date lue par le modèle est une PRÉSOMPTION. Tant que la case « Validé » '
    + 'n’est pas cochée, aucune alerte de dénonciation ne part pour ce contrat : vous '
    + 'recevez à la place une demande de vérification. Un outil qui laisserait '
    + 'reconduire sur la foi d’une lecture automatique serait pire que pas d’outil — '
    + 'on se croirait couvert.'],
  ['Les deux dates, et pourquoi elles diffèrent',
    '« Prochaine échéance » est la date de reconduction. « Dénoncer avant le » est le '
    + 'dernier jour utile, préavis déduit. Quand le préavis de la prochaine échéance '
    + 'est déjà passé, elle est acquise : la colonne « Pourquoi » le dit, et la date '
    + 'limite affichée vise alors la reconduction SUIVANTE.'],
  ['Conventions de calcul',
    'Un contrat prenant effet le 1er mars pour douze mois se reconduit le 1er mars '
    + 'suivant. Le dernier jour pour dénoncer est « échéance moins préavis », ce '
    + 'jour-là compris. Ajouter des mois ne déborde jamais : 31 janvier plus un mois '
    + 'vaut le 28 février.'],
  ['1. Régler',
    `Onglet « ${ONGLET_REGLAGES_} » : le dossier Drive des contrats, le mode d’appel `
    + 'au modèle, les paliers de rappel et le destinataire par défaut.'],
  ['2. Choisir où partent les contrats',
    'En mode Vertex, le contrat est analysé depuis VOTRE projet Cloud : il ne quitte '
    + 'pas votre périmètre contractuel Google Cloud. En mode clé AI Studio, il en '
    + 'sort. Sur des contrats commerciaux, c’est une question pour le juridique, pas '
    + 'un réglage technique.'],
  ['3. Lire le dossier',
    'Menu « Veille > Lire les contrats du dossier ». Chaque contrat trouvé pose une '
    + 'ligne présumée, avec l’extrait du texte sur lequel le modèle s’est appuyé.'],
  ['4. Valider',
    'Comparez l’extrait au contrat, corrigez les dates au besoin, cochez « Validé ». '
    + 'Votre adresse et la date sont inscrites en face : une validation sans nom ne '
    + 'responsabilise personne.'],
  ['5. Alerter',
    'Menu « Veille > Préparer les alertes » écrit le plan dans l’onglet des alertes, '
    + 'avec le message tel qu’il partira. Relisez, cochez « Valider », puis '
    + '« Envoyer les alertes validées ».'],
  ['Quand un contrat est dénoncé',
    'Portez la date dans « Dénoncé le ». Les rappels cessent aussitôt, et le contrat '
    + 'reste au tableau — l’historique vaut mieux qu’une ligne effacée.'],
  ['Ce que l’outil ne fait pas',
    'Il ne donne aucun avis juridique et n’interprète aucune clause. Il calcule des '
    + 'dates à partir de ce que vous ou le modèle avez saisi, et les affiche avec '
    + 'leur origine. La lecture du contrat reste la vôtre.'],
  ['Un document écarté',
    `L’onglet « ${ONGLET_ECARTES_} » liste ce que le modèle n’a pas reconnu comme un `
    + 'contrat. Il est visible exprès : un jugement automatique se conteste. Si un vrai '
    + 'contrat s’y trouve, ajoutez-le à la main dans l’onglet des contrats — une ligne '
    + 'saisie à la main vaut validée.'],
  ['Colonnes calculées',
    'Prochaine échéance, Dénoncer avant le, Jours restants, État, Pourquoi et Validé '
    + 'le sont réécrites à chaque recalcul : y saisir quelque chose à la main ne sert '
    + 'à rien. Toutes les autres colonnes sont à vous.'],
];

const installer_ = () => {
  const poses = [];

  const { feuille: contrats, cree: contratsCree } = SocleFeuilles.onglet(ONGLET_CONTRATS_);
  if (contratsCree || contrats.getLastRow() === 0) {
    SocleFeuilles.ecrireTable(ONGLET_CONTRATS_, COLONNES_CONTRATS_, []);
    contrats.setFrozenRows(1);
    poses.push(ONGLET_CONTRATS_);
  } else {
    SocleFeuilles.completerColonnes(ONGLET_CONTRATS_, COLONNES_CONTRATS_);
  }

  const { feuille: ecartes, cree: ecartesCree } = SocleFeuilles.onglet(ONGLET_ECARTES_);
  if (ecartesCree || ecartes.getLastRow() === 0) {
    SocleFeuilles.ecrireTable(ONGLET_ECARTES_, COLONNES_ECARTES_, []);
    ecartes.setFrozenRows(1);
    poses.push(ONGLET_ECARTES_);
  } else {
    SocleFeuilles.completerColonnes(ONGLET_ECARTES_, COLONNES_ECARTES_);
  }

  const { cree: reglagesCree } = SocleFeuilles.onglet(ONGLET_REGLAGES_);
  if (reglagesCree) {
    SocleFeuilles.ecrireTable(ONGLET_REGLAGES_, ['Réglage', 'Valeur'], []);
    poses.push(ONGLET_REGLAGES_);
  }
  SocleFeuilles.completerReglages(ONGLET_REGLAGES_, { [CLES_.dossier]: '', ...DEFAUTS_ });

  const { feuille: guide, cree: guideCree } = SocleFeuilles.onglet(ONGLET_GUIDE_);
  if (guideCree) {
    SocleFeuilles.ecrireTable(ONGLET_GUIDE_, ['Sujet', 'Ce qu’il faut savoir'],
      LIGNES_DU_GUIDE_());
    guide.setColumnWidth(1, 260);
    guide.setColumnWidth(2, 660);
    poses.push(ONGLET_GUIDE_);
  }

  contraindreLaSaisie_();

  // Après avoir posé nos onglets, et pas avant : Sheets refuse de supprimer la
  // dernière feuille d'un classeur.
  const retirees = SocleFeuilles.retirerFeuilleParDefaut().retirees;
  return { poses, retirees };
};
