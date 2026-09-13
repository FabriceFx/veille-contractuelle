/**
 * Lecture des contrats du dossier Drive — introduite en v0.1.
 *
 * Ce fichier ne produit **que des présomptions**. Rien de ce qu'il écrit ne
 * déclenche d'alerte de dénonciation tant qu'une personne n'a pas coché
 * « Validé ». C'est le contrat moral du produit : un outil qui dénoncerait —
 * ou laisserait reconduire — sur la foi d'une lecture automatique serait pire
 * que pas d'outil du tout, parce qu'on croirait être couvert.
 */

const MIME_DOSSIER_ = 'application/vnd.google-apps.folder';
const MIME_DOC_ = 'application/vnd.google-apps.document';
const MIME_PDF_ = 'application/pdf';
const PROFONDEUR_MAX_ = 5;

const TYPES_LUS_ = { [MIME_DOC_]: 'Document', [MIME_PDF_]: 'PDF' };

const SCHEMA_CONTRAT_ = {
  type: 'object',
  properties: {
    estUnContrat: { type: 'boolean' },
    fournisseur: { type: 'string' },
    objet: { type: 'string' },
    dateEffet: { type: 'string' },
    dureeInitialeMois: { type: 'number' },
    reconductionMois: { type: 'number' },
    preavis: { type: 'number' },
    unitePreavis: { type: 'string' },
    montantAnnuel: { type: 'number' },
    extrait: { type: 'string' },
    introuvable: { type: 'array', items: { type: 'string' } },
  },
  required: ['estUnContrat', 'extrait', 'introuvable'],
};

const INVITE_CONTRAT_ = `Tu lis un contrat pour en extraire les dates qui engagent.

Règles, sans exception :
- N'emploie QUE ce que contient le document. Rien de ce que tu sais par ailleurs, rien de ce qui est « habituel ».
- « dateEffet » au format aaaa-mm-jj. Si le document donne une date de signature et une date d'effet différentes, prends la date d'EFFET. Si tu ne la trouves pas, laisse la chaîne vide.
- « dureeInitialeMois », « reconductionMois », « preavis » : en nombre. Mets 0 pour « reconductionMois » si le contrat ne prévoit aucune tacite reconduction. Mets 0 partout où tu ne trouves pas, ne devine pas une durée usuelle.
- « unitePreavis » vaut exactement « mois » ou « jours », selon ce qu'écrit le contrat.
- « extrait » : recopie MOT POUR MOT la ou les phrases du contrat qui portent la durée, la reconduction et le préavis. C'est sur cet extrait qu'une personne vérifiera ton travail ; sans lui, ta lecture ne vaut rien.
- « introuvable » : nomme ce que tu n'as pas trouvé (par exemple « préavis », « date d'effet »). Une liste vide veut dire que tout y était.
- « estUnContrat » à false si le document n'est pas un contrat — une facture, une plaquette, un compte rendu. Dans ce cas, laisse tout le reste vide.`;

const enfantsDe_ = (idDossier) => SocleApi.parcourir(
  (jeton) => Drive.Files.list({
    q: `'${idDossier}' in parents and trashed = false`,
    pageSize: 200,
    pageToken: jeton,
    fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  }),
  { champ: 'files' },
);

/**
 * Le dossier, sous-dossiers compris, avec l'aveu de ce qui n'a pas pu être lu.
 *
 * `complet` n'est pas décoratif : un dossier momentanément illisible rend une
 * liste plus courte, et une liste plus courte ne doit jamais passer pour un
 * inventaire. Leçon payée sur l'assistant des procédures.
 */
const listerLesDocuments_ = (idDossier, profondeur = 0, chemin = '') => {
  const ici = chemin || 'racine';
  const lu = SocleErreurs.absorber(`dossier illisible (${ici})`,
    () => enfantsDe_(idDossier), null);

  const lacunes = [];
  if (lu === null) lacunes.push(`${ici} : dossier illisible`);
  else if (!lu.complet) lacunes.push(`${ici} : listage interrompu avant la fin`);

  const sortie = [];
  (lu === null ? [] : lu.elements).forEach((fichier) => {
    if (fichier.mimeType === MIME_DOSSIER_) {
      if (profondeur >= PROFONDEUR_MAX_) {
        lacunes.push(`${chemin ? `${chemin} / ` : ''}${fichier.name} : au-delà de `
          + `${PROFONDEUR_MAX_} niveaux`);
        return;
      }
      const dedans = listerLesDocuments_(fichier.id, profondeur + 1,
        chemin ? `${chemin} / ${fichier.name}` : fichier.name);
      Array.prototype.push.apply(sortie, dedans.documents);
      Array.prototype.push.apply(lacunes, dedans.lacunes);
      return;
    }
    const type = TYPES_LUS_[fichier.mimeType];
    if (!type) return;
    sortie.push({
      id: fichier.id,
      nom: fichier.name,
      type,
      lien: fichier.webViewLink || '',
      modifieLe: SocleDates.horodatage(fichier.modifiedTime),
      octets: Number(fichier.size || 0),
    });
  });

  return { documents: sortie, complet: lacunes.length === 0, lacunes };
};

const texteDuDocument_ = (id) => SocleReprises.appelHttp(
  `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`,
  { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` } },
).getContentText();

const pdfTropLourd_ = (nom, octets) => SocleErreurs.erreur({
  quoi: `Le PDF « ${nom} » pèse ${Math.round(octets / 1048576)} Mo, au-delà de la limite réglée.`,
  quoiFaire: `Découpez-le, ou relevez « ${CLES_.taillePdfMax} » dans les réglages.`,
});

const piecesPour_ = (document, taillePdfMaxOctets) => {
  if (document.type === 'Document') {
    const texte = texteDuDocument_(document.id);
    if (String(texte).trim() === '') {
      throw SocleErreurs.erreur({
        quoi: `Le document « ${document.nom} » est vide.`,
        quoiFaire: 'Retirez-le du dossier, ou complétez-le.',
      });
    }
    return [{ text: `--- Contrat : ${document.nom} ---\n${texte}` }];
  }

  if (document.octets > taillePdfMaxOctets) throw pdfTropLourd_(document.nom, document.octets);
  const octets = DriveApp.getFileById(document.id).getBlob().getBytes();
  if (octets.length > taillePdfMaxOctets) throw pdfTropLourd_(document.nom, octets.length);

  return [
    { text: `--- Contrat : ${document.nom} ---` },
    { inlineData: { mimeType: MIME_PDF_, data: Utilities.base64Encode(octets) } },
  ];
};

const COLONNES_ECARTES_ = ['Identifiant', 'Document', 'Lien', 'Lu le', 'Raison'];

/**
 * Ce que le modèle n'a pas retenu comme contrat, et qui doit s'en souvenir.
 *
 * Sans cet onglet, chaque plaquette du dossier repartait au modèle à chaque
 * passage : un coût par document et par exécution, indéfiniment. Il est
 * **visible** plutôt que caché parce qu'un jugement automatique se conteste :
 * si le modèle écarte un contrat, il faut pouvoir le voir et le rentrer à la
 * main.
 */
const ecarterLeDocument_ = (document, raison) => {
  const table = SocleFeuilles.lireTable(ONGLET_ECARTES_);
  const existante = table.lignes.find(
    (ligne) => String(ligne.Identifiant ?? '').trim() === document.id);
  const numero = existante ? existante.numero : table.lignes.length + 2;
  const valeurs = {
    Identifiant: document.id, Document: document.nom, Lien: document.lien,
    'Lu le': document.modifieLe, Raison: raison,
  };
  const ligne = COLONNES_ECARTES_.map((nom) => (nom in table.index ? valeurs[nom] : ''));
  table.feuille.getRange(numero, 1, 1, ligne.length).setValues([ligne]);
  SpreadsheetApp.flush();
};

const DUREE_DOCUMENT_MS_ = 45 * 1000;
const MARGE_DUREE_ = 1.2;

/**
 * Lit les documents du dossier et pose une ligne présumée par contrat trouvé.
 *
 * Ne repasse que sur ce qui a changé, et **décoche « Validé » quand le
 * document a été modifié** : une validation porte sur un texte, pas sur un nom
 * de fichier. Un avenant qui rallonge le préavis rendrait la validation
 * précédente fausse sans que rien ne le signale.
 */
const lireLesContratsDuDossier_ = () => {
  const config = reglages_();
  if (config.dossier === '') {
    throw SocleErreurs.erreur({
      quoi: 'Aucun dossier de contrats n’est indiqué.',
      quoiFaire: `Collez le lien du dossier Drive dans « ${ONGLET_REGLAGES_} », `
        + `ligne « ${CLES_.dossier} ».`,
    });
  }

  const { documents, complet, lacunes } = listerLesDocuments_(idDepuisLien_(config.dossier));
  // Ce dont on se souvient : les contrats ET les documents écartés. Oublier
  // les seconds les ferait relire à chaque passage, au prix d'un appel au
  // modèle par document et par exécution.
  const connus = {};
  [ONGLET_CONTRATS_, ONGLET_ECARTES_].forEach((onglet) => {
    SocleFeuilles.lireTable(onglet).lignes.forEach((ligne) => {
      const id = String(ligne.Identifiant ?? '').trim();
      if (id) connus[id] = ligne;
    });
  });

  const aLire = documents.filter((document) => {
    const connu = connus[document.id];
    return !connu || SocleDates.horodatage(connu['Lu le']) !== document.modifieLe;
  });

  const budget = SocleExecution.budget();
  const durees = [];
  let lus = 0;
  let ecartes = 0;
  let arret = null;

  for (const document of aLire) {
    const reserve = durees.length
      ? Math.round(Math.max.apply(null, durees) * MARGE_DUREE_) : DUREE_DOCUMENT_MS_;
    if (!budget.permet(reserve)) { arret = 'budget'; break; }

    const depart = Date.now();
    try {
      const fiche = interrogerLeModele_({
        invite: INVITE_CONTRAT_,
        pieces: piecesPour_(document, config.taillePdfMaxOctets),
        schema: SCHEMA_CONTRAT_,
        config,
      });
      if (fiche.estUnContrat === false) {
        ecarterLeDocument_(document, 'le modèle n’y voit pas un contrat');
        ecartes += 1;
      } else {
        poserLaPresomption_(document, fiche);
        lus += 1;
      }
    } catch (erreur) {
      SocleErreurs.absorber(`lecture impossible (${document.nom})`, () => { throw erreur; }, null);
    }
    durees.push(Date.now() - depart);
  }

  const reste = Math.max(0, aLire.length - lus - ecartes);
  if (arret === 'budget' && reste > 0) {
    SocleExecution.programmerReprise('reprendreLaLecture', 60 * 1000);
  } else {
    SocleExecution.retirerReprise('reprendreLaLecture');
  }

  return {
    documents: documents.length,
    complet,
    lacunes,
    lus,
    ecartes,
    restant: reste,
    repriseProgrammee: arret === 'budget' && reste > 0,
    absorptions: SocleErreurs.bilan(),
  };
};

/**
 * Écrit — ou réécrit — la ligne présumée d'un contrat.
 *
 * Ne touche jamais aux colonnes qui portent une décision humaine : le
 * responsable désigné, les notes, la date de dénonciation. Le modèle propose
 * des dates, il ne gère pas le contrat.
 */
const poserLaPresomption_ = (document, fiche) => {
  const table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
  const existante = table.lignes.find(
    (ligne) => String(ligne.Identifiant ?? '').trim() === document.id);
  const numero = existante ? existante.numero : table.lignes.length + 2;

  const unite = UNITES_PREAVIS_.includes(String(fiche.unitePreavis).trim())
    ? String(fiche.unitePreavis).trim() : 'mois';
  const introuvable = (fiche.introuvable || []).join(', ');

  const valeurs = {
    Identifiant: document.id,
    Contrat: SocleTexte.normaliserEspaces(fiche.objet || document.nom),
    Fournisseur: SocleTexte.normaliserEspaces(fiche.fournisseur || ''),
    Lien: document.lien,
    'Date d’effet': SocleDates.estJour(String(fiche.dateEffet)) ? String(fiche.dateEffet) : '',
    'Durée initiale (mois)': Number(fiche.dureeInitialeMois) || '',
    'Reconduction (mois)': Number(fiche.reconductionMois) || 0,
    'Préavis': Number(fiche.preavis) || '',
    'Unité du préavis': unite,
    'Montant annuel (€)': Number(fiche.montantAnnuel) || '',
    'Origine des dates': ORIGINES_.modele,
    // Décochée à chaque relecture : la validation portait sur le texte
    // précédent. Ne pas la remettre à zéro laisserait une validation périmée
    // couvrir un avenant que personne n'a lu.
    'Validé': false,
    'Validé par': '',
    'Validé le': '',
    'Extrait justificatif': SocleTexte.tronquer(String(fiche.extrait || ''), 900),
    'Lu le': document.modifieLe,
    'Dernier rappel (jours)': '',
    Notes: introuvable ? `Non trouvé par le modèle : ${introuvable}.` : '',
  };

  const ligne = new Array(table.entete.length).fill('');
  // Les colonnes que le modèle ne touche pas gardent ce qu'elles portaient.
  if (existante) {
    table.entete.forEach((nom, position) => { ligne[position] = existante.cellules[position]; });
  }
  Object.keys(valeurs).forEach((nom) => {
    if (nom in table.index) ligne[table.index[nom]] = valeurs[nom];
  });
  table.feuille.getRange(numero, 1, 1, ligne.length).setValues([ligne]);
  SpreadsheetApp.flush();
};
