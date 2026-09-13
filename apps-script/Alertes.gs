/**
 * Les alertes — introduites en v0.1.
 *
 * Un courriel part et ne revient pas : il passe donc par le motif « plan puis
 * application ». Le plan s'écrit dans un onglet, **avec le message tel qu'il
 * partira**, on le relit, on coche, puis on applique. Un plan qui n'afficherait
 * que des adresses demanderait de faire confiance au code sur ce qu'il compte
 * écrire, et la validation ne vaudrait plus rien.
 *
 * Deux natures d'alerte, et il faut les deux :
 *
 * - **Dénoncer** : la fenêtre de préavis est ouverte, les dates sont sûres.
 * - **Valider** : un contrat a été lu automatiquement et personne n'a confirmé
 *   ses dates. Sans cette seconde nature, un contrat lu puis oublié se
 *   reconduirait en silence — et l'outil aurait donné l'illusion de veiller.
 */

const COLONNES_PLAN_ = [
  'Nature', 'Repère du contrat', 'Contrat', 'Fournisseur', 'Destinataire',
  'Échéance', 'Dénoncer avant le', 'Jours restants', 'Palier', 'Objet', 'Message',
];

const NATURES_ = { denoncer: 'Dénoncer', valider: 'Valider' };

const repereDe_ = (entree) => String(entree.ligne.Identifiant ?? '').trim()
  || entree.contrat.nom;

/**
 * Le palier de rappel atteint : le plus proche de ceux qui sont franchis.
 *
 * À 45 jours de la limite, avec des rappels à 90, 60, 30 et 7, on a franchi 90
 * puis 60 ; c'est **60** qui est le palier courant. Prendre 90 ferait renvoyer
 * l'alerte déjà envoyée, prendre 30 ferait attendre quinze jours de plus.
 */
const palierAtteint_ = (joursRestants, rappels) => {
  const franchis = rappels.filter((seuil) => joursRestants <= seuil);
  return franchis.length ? Math.min(...franchis) : null;
};

const euros_ = (montant) => (montant > 0
  ? `${Math.round(montant).toLocaleString('fr-FR')} €` : 'non renseigné');

const messageDeDenonciation_ = (entree, situation) => {
  const c = entree.contrat;
  const lien = String(entree.ligne.Lien ?? '').trim();
  const lignes = [
    'Bonjour,',
    '',
    `Le contrat « ${c.nom} »${c.fournisseur ? ` (${c.fournisseur})` : ''} se reconduit `
      + `tacitement le ${SocleDates.lisible(situation.echeanceVisee)}.`,
    '',
    `Pour l’empêcher, la dénonciation doit partir au plus tard le `
      + `${SocleDates.lisible(situation.denoncerAvant)}, soit dans `
      + `${situation.joursRestants} jour(s).`,
    '',
    `Montant annuel : ${euros_(c.montant)}.`,
  ];
  if (lien) lignes.push(`Le contrat : ${lien}`);
  // L'échéance qui vient peut être déjà acquise : le taire ferait croire qu'on
  // agit sur elle, alors qu'on agit sur la suivante.
  if (situation.echeanceAcquise) {
    lignes.push('', `À noter : la reconduction du ${SocleDates.lisible(situation.echeance)} `
      + 'est acquise, son préavis étant passé. La date ci-dessus vise la reconduction '
      + 'suivante.');
  }
  lignes.push('', 'Si ce contrat a déjà été dénoncé, portez la date dans la colonne '
    + '« Dénoncé le » de l’onglet des contrats : les rappels cesseront.');
  return lignes.join('\n');
};

const messageDeValidation_ = (entree, presumee) => {
  const c = entree.contrat;
  const extrait = String(entree.ligne['Extrait justificatif'] ?? '').trim();
  const lignes = [
    'Bonjour,',
    '',
    `Le contrat « ${c.nom} »${c.fournisseur ? ` (${c.fournisseur})` : ''} a été lu `
      + 'automatiquement. Les dates ci-dessous sont des **présomptions** : personne '
      + 'ne les a encore vérifiées.',
    '',
    `  Date d’effet présumée : ${c.effet || '(non trouvée)'}`,
    `  Durée initiale présumée : ${c.dureeInitiale || '(non trouvée)'} mois`,
    `  Reconduction présumée : ${c.reconduction || '(aucune trouvée)'} mois`,
    `  Préavis présumé : ${c.preavis || '(non trouvé)'} ${c.unitePreavis}`,
  ];
  if (presumee.denoncerAvant) {
    lignes.push('', 'Si elles sont exactes, la date limite de dénonciation serait le '
      + `${SocleDates.lisible(presumee.denoncerAvant)} — dans `
      + `${presumee.joursRestants} jour(s).`);
  }
  if (extrait) lignes.push('', 'Ce sur quoi le modèle s’est appuyé :', `  « ${extrait} »`);
  lignes.push('', 'Tant que la case « Validé » n’est pas cochée dans l’onglet des '
    + 'contrats, AUCUN rappel de dénonciation ne partira pour ce contrat. '
    + 'Vérifiez les dates sur le contrat lui-même, corrigez-les au besoin, puis cochez.');
  return lignes.join('\n');
};

const destinataireDe_ = (contrat, config) => contrat.responsable || config.destinataire;

/**
 * Le plan des alertes du jour.
 *
 * `aujourdhui` reste un paramètre : c'est ce qui rend la veille testable sans
 * attendre qu'une échéance arrive vraiment.
 */
const construireLePlanDesAlertes_ = (aujourdhui) => {
  const config = reglages_();
  const lignes = [];

  lireLesContrats_(config).forEach((entree) => {
    const c = entree.contrat;
    const destinataire = destinataireDe_(c, config);
    const dejaRappele = entree.ligne['Dernier rappel (jours)'];
    const dernier = dejaRappele === '' || dejaRappele === null || dejaRappele === undefined
      ? null : Number(dejaRappele);

    if (c.denonceLe) return;

    // Les dates d'un contrat non validé sont présumées. On les calcule quand
    // même — pour trier, jamais pour affirmer : c'est le seul moyen de ne pas
    // noyer l'alerte de validation d'un contrat qui expire dans un mois au
    // milieu de cent contrats tranquilles.
    if (!c.valide) {
      const presumee = situationDuContrat_({ ...c, valide: true }, aujourdhui);
      const palier = presumee.joursRestants === ''
        ? null : palierAtteint_(presumee.joursRestants, config.rappels);
      if (palier === null || (dernier !== null && dernier <= palier)) return;
      lignes.push({
        Nature: NATURES_.valider,
        'Repère du contrat': repereDe_(entree),
        Contrat: c.nom,
        Fournisseur: c.fournisseur,
        Destinataire: destinataire,
        'Échéance': presumee.echeanceVisee,
        'Dénoncer avant le': presumee.denoncerAvant,
        'Jours restants': presumee.joursRestants,
        Palier: palier,
        Objet: `À vérifier : dates présumées du contrat « ${c.nom} »`,
        Message: messageDeValidation_(entree, presumee),
      });
      return;
    }

    const situation = situationDuContrat_(c, aujourdhui);
    if (situation.etat !== ETATS_CONTRAT_.fenetreOuverte) return;
    const palier = palierAtteint_(situation.joursRestants, config.rappels);
    if (palier === null || (dernier !== null && dernier <= palier)) return;

    lignes.push({
      Nature: NATURES_.denoncer,
      'Repère du contrat': repereDe_(entree),
      Contrat: c.nom,
      Fournisseur: c.fournisseur,
      Destinataire: destinataire,
      'Échéance': situation.echeanceVisee,
      'Dénoncer avant le': situation.denoncerAvant,
      'Jours restants': situation.joursRestants,
      Palier: palier,
      Objet: `Tacite reconduction : « ${c.nom} » à dénoncer avant le `
        + `${SocleDates.lisible(situation.denoncerAvant)}`,
      Message: messageDeDenonciation_(entree, situation),
    });
  });

  // Le plus urgent en tête : un plan se relit du haut, et c'est en haut qu'il
  // faut trouver ce qu'on ne peut pas remettre à la semaine prochaine.
  return lignes.sort((a, b) => Number(a['Jours restants']) - Number(b['Jours restants']));
};

/**
 * Note le palier envoyé sur la ligne du contrat, pour ne pas le renvoyer demain.
 *
 * Écrit **après** l'envoi, et c'est assumé : si l'exécution meurt entre les
 * deux, on renvoie un rappel déjà parti. Un rappel en double agace ; un rappel
 * perdu coûte une reconduction. L'ordre inverse échangerait la gêne contre le
 * dégât.
 */
const noterLeRappel_ = (repere, palier) => {
  const table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  const cible = table.lignes.find((ligne) => (String(ligne.Identifiant ?? '').trim()
    || String(ligne.Contrat ?? '').trim()) === repere);
  if (!cible) return false;
  table.feuille.getRange(cible.numero, table.index['Dernier rappel (jours)'] + 1)
    .setValue(palier);
  SpreadsheetApp.flush();
  return true;
};

const ADRESSE_PLAUSIBLE_ = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

const MEMOIRE_ALERTES_ = {};

const operationDAlerte_ = () => {
  if (MEMOIRE_ALERTES_.plan) return MEMOIRE_ALERTES_.plan;
  MEMOIRE_ALERTES_.plan = PlanPuisApplication.declarer({
    cle: 'alertesContractuelles',
    onglet: ONGLET_ALERTES_,
    colonnes: COLONNES_PLAN_,
    fonctionDeReprise: 'reprendreLesAlertes',
    // Une exécution tuée entre l'envoi et l'écriture laisse une ligne dont on
    // ne peut pas savoir si le courriel est parti. Seule une personne peut
    // trancher : « à vérifier », et rien ne la repasse en file toute seule.
    surInterruption: 'verifier',

    construirePlan: () => construireLePlanDesAlertes_(SocleDates.maintenantJour()),

    appliquerUnite: (ligne) => {
      const destinataire = String(ligne.Destinataire ?? '').trim();
      if (!ADRESSE_PLAUSIBLE_.test(destinataire)) {
        throw SocleErreurs.erreur({
          quoi: `Adresse inexploitable : « ${destinataire} ».`,
          quoiFaire: `Renseignez la colonne « Responsable » du contrat, ou le réglage `
            + `« ${CLES_.destinataire} ».`,
        });
      }
      // MailApp et non GmailApp : il ne sait qu'envoyer. Aucune portée de
      // lecture de la messagerie n'est demandée pour autant.
      MailApp.sendEmail({
        to: destinataire,
        subject: String(ligne.Objet ?? ''),
        body: String(ligne.Message ?? ''),
      });
      noterLeRappel_(String(ligne['Repère du contrat'] ?? ''), Number(ligne.Palier) || 0);
    },
  });
  return MEMOIRE_ALERTES_.plan;
};
