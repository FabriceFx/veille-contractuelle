/**
 * Points d'entrée — introduits en v0.1.
 *
 * Tout ce qui est ici est une `function` déclarée : c'est ce que l'éditeur
 * propose au menu d'exécution, et ce qu'un déclencheur sait résoudre par son
 * nom. Tout le reste du projet est en `const … = () => …`, invisible du menu —
 * on ne lance plus par mégarde une fonction interne à la place d'un point
 * d'entrée.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Veille')
    .addItem('Créer / compléter les onglets', 'installerLesOnglets')
    .addSeparator()
    .addItem('Lire les contrats du dossier', 'lireLeDossier')
    .addItem('Recalculer les échéances', 'recalculerLesEcheances')
    .addSeparator()
    .addItem('Préparer les alertes', 'preparerLesAlertes')
    .addItem('Envoyer les alertes validées', 'envoyerLesAlertes')
    .addItem('Oublier l’état du plan', 'oublierLEtatDuPlan')
    .addSeparator()
    .addItem('Où en est-on ?', 'ouEnEstOn')
    .addItem('Enregistrer la clé AI Studio', 'enregistrerLaCle')
    .addItem('Poser la veille quotidienne', 'poserLaVeilleQuotidienne')
    .addItem('Retirer la veille quotidienne', 'retirerLaVeilleQuotidienne')
    .addSeparator()
    .addItem('À propos', 'aPropos')
    .addToUi();
}

const signaler_ = (titre, erreur) => {
  console.error(SocleErreurs.pourLeJournal(erreur));
  const ui = SpreadsheetApp.getUi();
  ui.alert(titre, SocleErreurs.pourLUtilisateur(erreur), ui.ButtonSet.OK);
};

function installerLesOnglets() {
  const ui = SpreadsheetApp.getUi();
  try {
    const { poses, retirees } = installer_();
    const lignes = [poses.length === 0
      ? 'Les onglets étaient déjà en place ; les réglages manquants ont été ajoutés.'
      : `Onglet(s) créé(s) : ${poses.join(', ')}.`];
    if (retirees.length) lignes.push(`Onglet vide retiré : ${retirees.join(', ')}.`);
    if (poses.length) {
      lignes.push('', `Commencez par l’onglet « ${ONGLET_GUIDE_} » : il dit dans quel `
        + 'ordre prendre les choses.');
    }
    ui.alert('Installation', lignes.join('\n'), ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Installation impossible', erreur);
  }
}

const redigerBilanDeLecture_ = (bilan) => {
  const phrases = [bilan.complet
    ? `${bilan.documents} document(s) dans le dossier.`
    : `${bilan.documents} document(s) vus — le dossier n’a PAS pu être lu en entier.`];
  if (!bilan.complet) {
    bilan.lacunes.forEach((lacune) => phrases.push(`  ${lacune}`));
    phrases.push('Aucune ligne n’a été retirée de l’inventaire : une panne de lecture '
      + 'ne vaut pas suppression.');
  }
  if (bilan.lus) {
    phrases.push(`${bilan.lus} contrat(s) lu(s) — leurs dates sont des PRÉSOMPTIONS `
      + 'tant que la case « Validé » n’est pas cochée.');
  }
  if (bilan.ecartes) phrases.push(`${bilan.ecartes} document(s) écarté(s) : pas des contrats.`);
  if (bilan.repriseProgrammee) {
    phrases.push(`${bilan.restant} restant(s) : une reprise est programmée dans une minute.`);
  }
  if (bilan.absorptions && bilan.absorptions.total) {
    phrases.push(`\n${bilan.absorptions.total} échec(s) absorbé(s) :`);
    bilan.absorptions.causes.forEach((c) => phrases.push(`  ${c.cause} (${c.occurrences})`));
  }
  return phrases.join('\n');
};

function lireLeDossier() {
  const ui = SpreadsheetApp.getUi();
  try {
    const bilan = lireLesContratsDuDossier_();
    recalculerLesContrats_(SocleDates.maintenantJour());
    ui.alert('Lecture du dossier', redigerBilanDeLecture_(bilan), ui.ButtonSet.OK);
    SpreadsheetApp.getActive().getSheetByName(ONGLET_CONTRATS_).activate();
  } catch (erreur) {
    signaler_('Lecture impossible', erreur);
  }
}

/** Cible du déclencheur de reprise. Tourne sans personne devant l'écran. */
function reprendreLaLecture() {
  SocleExecution.retirerReprise('reprendreLaLecture');
  const bilan = lireLesContratsDuDossier_();
  recalculerLesContrats_(SocleDates.maintenantJour());
  console.log(redigerBilanDeLecture_(bilan));
  return bilan;
}

function recalculerLesEcheances() {
  const ui = SpreadsheetApp.getUi();
  try {
    const bilan = recalculerLesContrats_(SocleDates.maintenantJour());
    const detail = Object.keys(bilan.parEtat).sort()
      .map((etat) => `  ${etat} : ${bilan.parEtat[etat]}`).join('\n');
    ui.alert('Échéances', `${bilan.contrats} contrat(s).\n${detail}`, ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Recalcul impossible', erreur);
  }
}

function preparerLesAlertes() {
  const ui = SpreadsheetApp.getUi();
  try {
    recalculerLesContrats_(SocleDates.maintenantJour());
    const bilan = operationDAlerte_().preparer();
    ui.alert('Plan des alertes',
      `${bilan.lignes} alerte(s) préparée(s) dans « ${bilan.onglet} ».\n\n`
      + 'Relisez les messages tels qu’ils partiront, cochez « Valider » sur ceux que '
      + 'vous approuvez, puis « Envoyer les alertes validées ». Rien ne part tant que '
      + 'vous n’avez pas coché.',
      ui.ButtonSet.OK);
    SpreadsheetApp.getActive().getSheetByName(ONGLET_ALERTES_).activate();
  } catch (erreur) {
    signaler_('Préparation impossible', erreur);
  }
}

function envoyerLesAlertes() {
  const ui = SpreadsheetApp.getUi();
  try {
    const bilan = operationDAlerte_().appliquer();
    ui.alert('Envoi', JSON.stringify(bilan, null, 2), ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Envoi impossible', erreur);
  }
}

/** Cible du déclencheur de reprise du plan. */
function reprendreLesAlertes() {
  return operationDAlerte_().reprendre();
}

function oublierLEtatDuPlan() {
  const ui = SpreadsheetApp.getUi();
  try {
    const bilan = operationDAlerte_().oublierEtat();
    ui.alert('État du plan', JSON.stringify(bilan, null, 2), ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Impossible', erreur);
  }
}

function ouEnEstOn() {
  const ui = SpreadsheetApp.getUi();
  try {
    const bilan = recalculerLesContrats_(SocleDates.maintenantJour());
    const attente = construireLePlanDesAlertes_(SocleDates.maintenantJour());
    const parNature = {};
    attente.forEach((l) => { parNature[l.Nature] = (parNature[l.Nature] || 0) + 1; });
    ui.alert('Où en est-on ?',
      `${bilan.contrats} contrat(s) à l’inventaire.\n`
      + `${Object.keys(bilan.parEtat).sort()
        .map((etat) => `  ${etat} : ${bilan.parEtat[etat]}`).join('\n')}\n\n`
      + `${attente.length} alerte(s) à préparer :\n`
      + `${Object.keys(parNature).sort()
        .map((n) => `  ${n} : ${parNature[n]}`).join('\n') || '  aucune'}\n\n`
      + `Version ${VERSION_}.`,
      ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Lecture impossible', erreur);
  }
}

function enregistrerLaCle() {
  const ui = SpreadsheetApp.getUi();
  try {
    declarerLesSecrets_();
    const reponse = ui.prompt('Clé AI Studio',
      'Collez la clé. Elle est rangée dans les propriétés du script et n’apparaîtra '
      + 'dans aucun onglet.\n\nEn mode Vertex, cette clé est inutile : c’est le jeton '
      + 'OAuth de qui exécute qui sert, et le contrat ne quitte pas votre projet Cloud.',
      ui.ButtonSet.OK_CANCEL);
    if (reponse.getSelectedButton() !== ui.Button.OK) return;
    const cle = reponse.getResponseText().trim();
    if (cle === '') return;
    SocleSecrets.ecrire(CLE_SECRET_GEMINI_, cle);
    ui.alert('Clé enregistrée', SocleSecrets.masquer(cle), ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Enregistrement impossible', erreur);
  }
}

/**
 * La veille quotidienne recalcule et prévient. Elle ne prépare pas le plan.
 *
 * `preparer` efface le plan en cours : le reconstruire chaque nuit balaierait
 * les cases déjà cochées par quelqu'un la veille au soir. Le calcul est
 * automatique, la décision reste un geste.
 */
function veilleQuotidienne() {
  const aujourdhui = SocleDates.maintenantJour();
  recalculerLesContrats_(aujourdhui);
  const attente = construireLePlanDesAlertes_(aujourdhui);
  if (attente.length === 0) return { alertes: 0 };

  const destinataire = SocleErreurs.absorber('identité indisponible',
    () => Session.getEffectiveUser().getEmail(), '');
  if (destinataire) {
    const urgentes = attente.slice(0, 10)
      .map((l) => `  ${l['Jours restants']} j — ${l.Contrat} (${l.Nature})`).join('\n');
    MailApp.sendEmail({
      to: destinataire,
      subject: `Veille contractuelle : ${attente.length} action(s) en attente`,
      body: `${attente.length} contrat(s) demandent une action.\n\n${urgentes}\n\n`
        + 'Ouvrez le classeur, « Veille > Préparer les alertes », relisez et cochez. '
        + 'Rien ne part sans votre validation.',
    });
  }
  return { alertes: attente.length };
}

function poserLaVeilleQuotidienne() {
  const ui = SpreadsheetApp.getUi();
  try {
    retirerLaVeilleQuotidienne_();
    ScriptApp.newTrigger('veilleQuotidienne').timeBased().atHour(7).everyDays(1).create();
    ui.alert('Veille quotidienne',
      'Posée, vers 7 h. Elle recalcule les échéances et vous prévient quand une '
      + 'action attend. Elle ne prépare ni n’envoie rien toute seule.\n\n'
      + 'Ce déclencheur s’exécute sous VOTRE identité : les contrats seront lus avec '
      + 'vos droits Drive, pas ceux de qui ouvre le classeur.',
      ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Impossible de poser la veille', erreur);
  }
}

const retirerLaVeilleQuotidienne_ = () => {
  ScriptApp.getProjectTriggers()
    .filter((declencheur) => declencheur.getHandlerFunction() === 'veilleQuotidienne')
    .forEach((declencheur) => ScriptApp.deleteTrigger(declencheur));
};

function retirerLaVeilleQuotidienne() {
  const ui = SpreadsheetApp.getUi();
  try {
    retirerLaVeilleQuotidienne_();
    ui.alert('Veille quotidienne', 'Retirée.', ui.ButtonSet.OK);
  } catch (erreur) {
    signaler_('Impossible', erreur);
  }
}

function aPropos() {
  const config = SocleErreurs.absorber('réglages illisibles', () => reglages_(), null);
  SpreadsheetApp.getUi().alert('À propos',
    `Veille contractuelle et tacite reconduction — version ${VERSION_}.\n\n`
    + 'Il tient l’inventaire de vos contrats, calcule la date après laquelle chacun se '
    + 'reconduit, et alerte avant. Une date lue automatiquement reste une présomption '
    + 'jusqu’à ce qu’une personne la valide.\n\n'
    + `Appel au modèle : ${config ? config.mode : '(réglages illisibles)'}.\n`
    + (config && config.mode === MODES_MODELE_.aiStudio
      ? 'Les contrats sortent alors de votre périmètre contractuel Google Cloud.\n'
      : 'Les contrats ne quittent pas votre projet Cloud.\n')
    + `\nSocle ${SocleFeuilles.version} · Plan puis application `
    + `${PlanPuisApplication.version}.\n`
    + 'Aucun avis juridique : l’outil calcule des dates, il n’interprète pas de clause.\n\n'
    + 'Développé par Fabrice Faucheux · https://faucheux.bzh',
    SpreadsheetApp.getUi().ButtonSet.OK);
}
