// Banc d'essai — se lance hors de Google :
//
//     node banc/test.js
//
// Les faux services refusent ce que les vrais refusent, et rendent `null` là
// où Google rend `null`. Ce qu'ils ne peuvent pas prouver — que l'API Gemini
// accepte vraiment un PDF en pièce jointe, que le modèle nommé existe — se
// mesure dans Apps Script, pas ici.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'apps-script');

// Chez Google, l'heure locale d'un script est celle du fuseau de
// appsscript.json ; Node prend celui de la machine. Sans cette ligne, le banc
// passe sur un poste réglé sur le bon fuseau et échoue sur la CI en UTC — ou
// pire, l'inverse. Le fuseau est imposé avant toute création de Date.
process.env.TZ = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'appsscript.json'), 'utf8')).timeZone || 'UTC';
const FICHIERS = ['SocleDates.gs', 'SocleTexte.gs', 'SocleFeuilles.gs', 'SocleErreurs.gs',
  'SocleReprises.gs', 'SocleExecution.gs', 'SocleSecrets.gs', 'SocleApi.gs',
  'PlanPuisApplication.gs', 'Commun.gs', 'Echeances.gs', 'Contrats.gs',
  'Extraction.gs', 'Alertes.gs', 'Installation.gs', 'Menu.gs'];

let passes = 0;
const echecs = [];
let courante = '';
const section = (t) => { courante = t; console.log(`\n— ${t}`); };
const verifier = (c, m) => {
  if (c) { passes += 1; return; }
  echecs.push(`${courante} · ${m}`);
  console.log(`  ÉCHEC : ${m}`);
};
const egal = (o, a, m) => verifier(JSON.stringify(o) === JSON.stringify(a),
  `${m} — attendu ${JSON.stringify(a)}, obtenu ${JSON.stringify(o)}`);
const leve = (f, motif, m) => {
  try { f(); verifier(false, `${m} — aucune exception levée`); } catch (e) {
    verifier(motif.test(String(e.message || e)), `${m} — message inattendu : ${e.message || e}`);
  }
};

// ---------------------------------------------------------------------------

const monter = (options = {}) => {
  const horloge = { ms: Date.parse('2026-09-12T09:00:00+02:00') };
  class FauxDate extends Date {
    constructor(...a) { if (a.length === 0) super(horloge.ms); else super(...a); }
    static now() { return horloge.ms; }
  }

  const feuilles = {};
  class FausseFeuille {
    constructor(nom) { this.nom = nom; this.cellules = []; this.validations = {}; }
    getName() { return this.nom; }
    getLastRow() { return this.cellules.length; }
    getMaxRows() { return Math.max(this.cellules.length, 1000); }
    setFrozenRows() { return this; }
    getLastColumn() { return this.cellules.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); }
    getRange(l, c, h = 1, w = 1) {
      if (![l, c, h, w].every((n) => Number.isInteger(n) && n >= 1)) {
        throw new Error('The number of rows or columns in the range must be at least 1.');
      }
      const f = this;
      return {
        setValues(v) {
          if (v.length !== h) throw new Error('The number of rows in the data does not match.');
          v.forEach((r, i) => {
            const cible = l + i - 1;
            f.cellules[cible] = f.cellules[cible] || [];
            r.forEach((x, j) => { f.cellules[cible][c + j - 1] = x; });
          });
          return this;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < h; i += 1) {
            const r = f.cellules[l + i - 1] || [];
            const ligne = [];
            for (let j = 0; j < w; j += 1) ligne.push(r[c + j - 1] === undefined ? '' : r[c + j - 1]);
            out.push(ligne);
          }
          return out;
        },
        setValue(x) { return this.setValues([[x]]); },
        getValue() { return this.getValues()[0][0]; },
        setFontWeight() { return this; },
        setDataValidation(regle) {
          for (let i = 0; i < h; i += 1) f.validations[`${l + i}:${c}`] = regle;
          return this;
        },
        clearContent() {
          for (let i = 0; i < h; i += 1) f.cellules[l + i - 1] = [];
          return this;
        },
      };
    }
    clear() { this.cellules = []; return this; }
    setFrozenRows() { return this; }
    setColumnWidth() { return this; }
    activate() { return this; }
  }
  const classeur = {
    getSheetByName: (n) => feuilles[n] || null,
    insertSheet(n) { feuilles[n] = new FausseFeuille(n); return feuilles[n]; },
    getSheets: () => Object.keys(feuilles).map((n) => feuilles[n]),
    deleteSheet(f) {
      if (Object.keys(feuilles).length <= 1) {
        throw new Error('You can\'t remove all the sheets in a document.');
      }
      delete feuilles[f.getName()];
    },
  };

  const proprietes = {};
  const magasin = (c) => ({
    getProperty: (k) => (k in c ? c[k] : null),
    setProperty(k, v) {
      if (String(v).length > 9216) throw new Error('Argument too large: value');
      c[k] = String(v); return this;
    },
    deleteProperty(k) { delete c[k]; return this; },
    getKeys: () => Object.keys(c),
  });

  const appels = { fetch: [], modele: [], blob: [], courriels: [], declencheurs: [], alertes: [], menu: [] };
  const reponses = (options.reponsesModele || []).slice();
  const fichiersDrive = options.fichiers || {};
  const enPanne = options.driveEnPanne || new Set();
  const octetsPdf = options.octetsPdf || {};

  const sandbox = {
    HtmlService: {
      createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({}) }) }),
      createHtmlOutputFromFile: () => ({ getContent: () => '<style></style>' }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    },
    Session: {
      getScriptTimeZone: () => 'Europe/Paris',
      getActiveUser: () => ({ getEmail: () => 'moi@exemple.org' }),
      getEffectiveUser: () => ({ getEmail: () => 'moi@exemple.org' }),
    },
    MailApp: {
      sendEmail(message) {
        // Le vrai service refuse un envoi sans destinataire, avec ce message.
        if (!message || !String(message.to || '').trim()) {
          throw new Error('Failed to send email: no recipient');
        }
        appels.courriels.push(message);
      },
    },
    SpreadsheetApp: {
      getActive: () => classeur,
      flush: () => {},
      // L'interface, réduite à ce qu'on peut observer : ce que l'outil DIT à
      // l'utilisateur fait partie de ce qu'il faut vérifier.
      getUi: () => ({
        ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
        Button: { OK: 'OK', CANCEL: 'CANCEL' },
        alert(titre, message) { appels.alertes.push({ titre, message }); return 'OK'; },
        prompt(titre, message) {
          appels.alertes.push({ titre, message });
          const saisie = (options.saisies || []).shift();
          return {
            getSelectedButton: () => (saisie === undefined ? 'CANCEL' : 'OK'),
            getResponseText: () => saisie || '',
          };
        },
        createMenu: () => {
          const menu = {
            addItem(libelle, cible) { appels.menu.push({ libelle, cible }); return menu; },
            addSeparator: () => menu,
            addToUi: () => {},
          };
          return menu;
        },
      }),
      newDataValidation: () => {
        const regle = { valeurs: null, bloquant: null, min: null, max: null, aide: '' };
        const bati = {
          requireValueInList(v) {
            // Le vrai service refuse une liste vide ; un faux complaisant
            // laisserait poser une liste déroulante sans rien dedans.
            if (!Array.isArray(v) || v.length === 0) {
              throw new Error('The parameters (null) don\'t match requireValueInList.');
            }
            regle.valeurs = v; return bati;
          },
          requireNumberBetween(a, b) { regle.min = a; regle.max = b; return bati; },
          requireCheckbox() { regle.caseACocher = true; return bati; },
          setAllowInvalid(x) { regle.bloquant = x === false; return bati; },
          setHelpText(t) { regle.aide = t; return bati; },
          build: () => regle,
        };
        return bati;
      },
    },
    PropertiesService: {
      getScriptProperties: () => magasin(proprietes),
      getDocumentProperties: () => null,
      getUserProperties: () => magasin({}),
    },
    LockService: (() => {
      // Ce projet est LIÉ à un classeur : `getDocumentLock` y rend un vrai
      // verrou. Dans un script autonome il rendrait `null` — c'est ce que
      // modélise `verrouDocumentAbsent`, et un module qui appelle `.tryLock()`
      // sans le prévoir s'y casse.
      const etat = { pris: false };
      const verrou = {
        tryLock: (ms) => { if (etat.pris) return false; etat.pris = true; return true; },
        releaseLock: () => { etat.pris = false; },
      };
      return {
        getDocumentLock: () => (options.verrouDocumentAbsent ? null : verrou),
        getScriptLock: () => verrou,
      };
    })(),
    ScriptApp: {
      getOAuthToken: () => 'JETON_FACTICE',
      getProjectTriggers: () => appels.declencheurs.map((d) => ({
        getHandlerFunction: () => d.fonction,
      })),
      newTrigger(fonction) {
        // Le vrai service refuse une cible qui n'est pas une `function`
        // déclarée — au moment de la création, pas au déclenchement.
        const pose = { fonction, apres: null, heure: null, jours: null };
        const calendrier = {
          after: (ms) => { pose.apres = ms; return calendrier; },
          atHour: (h) => { pose.heure = h; return calendrier; },
          everyDays: (n) => { pose.jours = n; return calendrier; },
          create: () => { appels.declencheurs.push(pose); return pose; },
        };
        return { timeBased: () => calendrier };
      },
      deleteTrigger: (d) => {
        const i = appels.declencheurs.findIndex(
          (x) => x.fonction === d.getHandlerFunction());
        if (i >= 0) appels.declencheurs.splice(i, 1);
      },
    },
    DriveApp: {
      getFileById: (id) => ({
        // Un vrai blob pèse ce que pèse le fichier. Un faux qui rend toujours
        // trois octets ne peut jamais dépasser une limite — il valide donc
        // aussi bien le code qui la respecte que celui qui l'ignore.
        getBlob: () => {
          appels.blob.push(id);
          return { getBytes: () => new Array(octetsPdf[id] || 3) };
        },
      }),
    },
    Drive: {
      Files: {
        list: (args) => {
          const parent = /'([^']+)' in parents/.exec(args.q)[1];
          // Le vrai service tombe en panne, et le faux doit savoir tomber :
          // un simulateur qui répond toujours valide un code qui perd des
          // données le jour où Drive rend un 500.
          if (enPanne.has(parent)) {
            throw new Error('API call to drive.files.list failed with error: Internal Error');
          }
          return { files: (fichiersDrive[parent] || []) };
        },
      },
    },
    UrlFetchApp: {
      avantChaqueAppel: null,
      fetch(url, opts) {
        if (this.avantChaqueAppel) this.avantChaqueAppel();
        appels.fetch.push({ url, opts });
        if (url.indexOf('generativelanguage') >= 0 || url.indexOf('aiplatform') >= 0) {
          appels.modele.push(JSON.parse(opts.payload));
          const reponse = reponses.shift()
            || { texte: JSON.stringify({ estUnContrat: true, extrait: 'Article 3.', introuvable: [] }) };
          if (reponse.erreur) {
            return { getResponseCode: () => reponse.code || 500, getContentText: () => reponse.erreur };
          }
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              candidates: [{ content: { parts: [{ text: reponse.texte }] } }],
            }),
          };
        }
        return { getResponseCode: () => 200, getContentText: () => (options.texteExport ?? 'Texte du document.') };
      },
    },
    Utilities: {
      formatDate(d, z, f) {
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
          throw new Error("The parameters (null,String,String) don't match the method signature.");
        }
        const p = {};
        new Intl.DateTimeFormat('en-CA', {
          timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
        return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
          .replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute)
          .replace('ss', p.second);
      },
      sleep: () => {},
      base64Encode: (o) => `base64(${o.length})`,
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date: FauxDate,
    JSON, Math, Number, String, Object, Array, Boolean, RegExp, Error, Intl,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FICHIERS.forEach((n) => vm.runInContext(
    fs.readFileSync(path.join(DOSSIER, n), 'utf8'), sandbox, { filename: n }));

  return {
    sandbox, classeur, feuilles, appels, proprietes, horloge, reponses,
    avancer: (ms) => { horloge.ms += ms; },
    lire: (e) => vm.runInContext(e, sandbox),
  };
};

const lignesDe = (contexte, onglet) => {
  const f = contexte.feuilles[onglet];
  if (!f) return [];
  const h = f.getLastRow();
  const w = f.getLastColumn();
  const v = f.getRange(1, 1, h, w).getValues();
  const entete = v[0].map(String);
  return v.slice(1).map((c) => {
    const o = {};
    entete.forEach((n, i) => { o[n] = c[i]; });
    return o;
  });
};

// ---------------------------------------------------------------------------


const poser_ = (contexte, valeurs) => {
  const json = JSON.stringify(valeurs).replace(/`/g, '\\`');
  contexte.lire(`(() => {
    const table = SocleFeuilles.lireTable(ONGLET_CONTRATS_);
    const ligne = new Array(table.entete.length).fill('');
    const v = JSON.parse(${JSON.stringify(json)});
    Object.keys(v).forEach((n) => { if (n in table.index) ligne[table.index[n]] = v[n]; });
    table.feuille.getRange(table.lignes.length + 2, 1, 1, ligne.length).setValues([ligne]);
  })()`);
};

const prepare_ = (options = {}) => {
  const contexte = monter(options);
  contexte.lire('installer_()');
  contexte.lire("SocleFeuilles.ecrireReglage('Réglages', 'Dossier des contrats (lien Drive)', 'RACINE')");
  contexte.lire("SocleFeuilles.ecrireReglage('Réglages', 'Projet Cloud (pour Vertex)', 'mon-projet')");
  contexte.lire("SocleFeuilles.ecrireReglage('Réglages', 'Destinataire par défaut des alertes', 'veille@exemple.org')");
  return contexte;
};

// ---------------------------------------------------------------------------

section('A. Intégrité du projet');
{
  const sources = fs.readdirSync(DOSSIER).filter((n) => n.endsWith('.gs'));
  egal(sources.slice().sort(), FICHIERS.slice().sort(),
    'le banc charge exactement les fichiers du projet — un fichier ajouté et jamais '
    + 'chargé ne serait testé par rien');

  // Deux constantes globales de même nom entre deux fichiers empêchent le
  // projet ENTIER de se charger : toutes ses fonctions deviennent introuvables
  // d'un coup, y compris celles qui n'ont rien à voir.
  const vus = {};
  const collisions = [];
  sources.forEach((nom) => {
    const texte = fs.readFileSync(path.join(DOSSIER, nom), 'utf8');
    [...texte.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)]
      .forEach((m) => {
        if (vus[m[1]] && vus[m[1]] !== nom) collisions.push(`${m[1]} (${vus[m[1]]} et ${nom})`);
        vus[m[1]] = nom;
      });
  });
  egal(collisions, [], 'aucun nom global déclaré dans deux fichiers');

  const declaree = fs.readFileSync(path.join(RACINE, 'VERSION'), 'utf8').trim();
  const dansLeCode = /const VERSION_ = '([^']+)'/.exec(
    fs.readFileSync(path.join(DOSSIER, 'Commun.gs'), 'utf8'))[1];
  egal(dansLeCode, declaree, 'la version du code vaut le fichier VERSION');

  // Les cibles de déclencheur et les entrées de menu se résolvent par leur nom
  // global : elles DOIVENT rester des `function` déclarées.
  const menu = fs.readFileSync(path.join(DOSSIER, 'Menu.gs'), 'utf8');
  const appelees = [...menu.matchAll(/addItem\('[^']*', '([^']+)'\)/g)].map((m) => m[1]);
  const declarees = [...menu.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  egal(appelees.filter((n) => !declarees.includes(n)), [],
    'chaque entrée de menu vise une fonction déclarée dans le même fichier');
  ['reprendreLaLecture', 'reprendreLesAlertes', 'veilleQuotidienne'].forEach((nom) => {
    verifier(declarees.includes(nom), `${nom} est une function déclarée — un déclencheur `
      + 'la résout par son nom, une arrow function serait introuvable');
  });
}

section('B. Ajouter des mois ne déborde jamais sur le mois suivant');
{
  const contexte = monter();
  const ajouter = (jour, mois) => contexte.lire(`ajouterMois_('${jour}', ${mois})`);

  // Le piège central du domaine. `new Date(2026, 0, 31).setMonth(1)` rend le
  // 3 mars : un contrat signé un 31 verrait toutes ses échéances décalées, et
  // son préavis calculé sur la mauvaise date.
  egal(ajouter('2026-01-31', 1), '2026-02-28', '31 janvier + 1 mois = 28 février');
  egal(ajouter('2028-01-31', 1), '2028-02-29', 'et 29 février une année bissextile');
  egal(ajouter('2026-08-31', 1), '2026-09-30', '31 août + 1 mois = 30 septembre');
  egal(ajouter('2026-03-31', -1), '2026-02-28', 'et le calcul à rebours borne pareillement');

  egal(ajouter('2026-03-01', 12), '2027-03-01', 'douze mois franchissent l’année');
  egal(ajouter('2026-01-15', -3), '2025-10-15', 'et un retrait franchit l’année à l’envers');
  egal(ajouter('2026-02-28', 12), '2027-02-28', 'le 28 février reste le 28 février');

  // Un jour qui n'existe pas dans le mois d'arrivée ne doit jamais produire
  // une date du mois suivant, quel que soit le pas.
  const debordements = [];
  for (let mois = 1; mois <= 36; mois += 1) {
    ['2026-01-29', '2026-01-30', '2026-01-31', '2026-03-31', '2026-05-31'].forEach((depart) => {
      const attenduMois = ((Number(depart.slice(5, 7)) - 1 + mois) % 12) + 1;
      const obtenu = Number(ajouter(depart, mois).slice(5, 7));
      if (obtenu !== attenduMois) debordements.push(`${depart} + ${mois} → ${obtenu}`);
    });
  }
  egal(debordements, [], 'sur trois ans de pas, aucun débordement de mois');
}

section('C. Deux dates, parce qu’elles ne disent pas la même chose');
{
  const contexte = monter();
  const situation = (contrat, jour) => contexte.lire(
    `situationDuContrat_(JSON.parse(${JSON.stringify(JSON.stringify(contrat))}), '${jour}')`);

  const bail = {
    effet: '2024-03-01', dureeInitiale: 12, reconduction: 12,
    preavis: 3, unitePreavis: 'mois', valide: true, seuilAlerteJours: 90,
  };

  const avant = situation(bail, '2026-09-13');
  egal(avant.echeance, '2027-03-01', 'la prochaine reconduction est celle qui suit aujourd’hui');
  egal(avant.denoncerAvant, '2026-12-01', 'et le dernier jour utile retire le préavis');
  egal(avant.joursRestants, 79, 'les jours restants se comptent jusqu’à ce jour-là');
  egal(avant.etat, 'Fenêtre ouverte', 'sous le premier palier, la fenêtre est ouverte');
  verifier(!avant.echeanceAcquise, 'et rien n’est encore acquis');

  // Le cas qui coûte cher : le préavis vient de passer. Un tableau naïf
  // afficherait « échéance 1er mars 2027 » et laisserait croire qu’on peut
  // encore agir, alors que cette reconduction-là est jouée.
  const apres = situation(bail, '2026-12-15');
  egal(apres.echeance, '2027-03-01', 'la reconduction qui vient reste affichée');
  verifier(apres.echeanceAcquise, 'mais elle est dite acquise');
  egal(apres.denoncerAvant, '2027-12-01',
    'et la date limite affichée vise la reconduction SUIVANTE');
  egal(apres.echeanceVisee, '2028-03-01', 'laquelle est nommée, pour qu’on ne la confonde pas');
  verifier(/acquise/.test(apres.pourquoi), 'la colonne « Pourquoi » le dit en toutes lettres');

  // Le jour même de la limite, la fenêtre est encore ouverte : « au plus tard
  // le » comprend ce jour-là, et c’est écrit dans les conventions.
  const pile = situation(bail, '2026-12-01');
  egal(pile.joursRestants, 0, 'le jour de la limite, il reste zéro jour');
  egal(pile.echeanceVisee, '2027-03-01', 'et l’on agit encore sur l’échéance qui vient');

  const enJours = situation({ ...bail, preavis: 60, unitePreavis: 'jours' }, '2026-09-13');
  egal(enJours.denoncerAvant, '2026-12-31', 'un préavis en jours se retire en jours');

  const sansTacite = situation({ ...bail, reconduction: 0 }, '2026-09-13');
  egal(sansTacite.etat, 'Sans reconduction', 'sans reconduction, il n’y a rien à empêcher');
  egal(sansTacite.echeance, '2025-03-01', 'mais le terme reste affiché');

  const incomplet = situation({ ...bail, effet: '' }, '2026-09-13');
  egal(incomplet.etat, 'Incomplet', 'sans date d’effet, on ne calcule rien');
  verifier(/date d’effet/.test(incomplet.pourquoi), 'et l’on dit ce qui manque');
  egal(incomplet.echeance, '', 'surtout, on n’invente aucune date');

  const denonce = situation({ ...bail, denonceLe: '2026-05-02' }, '2026-09-13');
  egal(denonce.etat, 'Dénoncé', 'un contrat dénoncé sort de la veille');
}

section('D. Une date présumée ne déclenche rien');
{
  const contexte = monter();
  const situation = (contrat) => contexte.lire(
    `situationDuContrat_(JSON.parse(${JSON.stringify(JSON.stringify(contrat))}), '2026-09-13')`);

  const presume = {
    effet: '2024-03-01', dureeInitiale: 12, reconduction: 12,
    preavis: 3, unitePreavis: 'mois', valide: false, seuilAlerteJours: 90,
  };

  // C'est LA règle du produit. Une présomption affichée dans la colonne d'un
  // fait devient un fait au bout de trois jours.
  const r = situation(presume);
  egal(r.etat, 'À valider', 'un contrat non validé n’a pas d’état d’échéance');
  egal(r.echeance, '', 'aucune échéance n’est affichée');
  egal(r.denoncerAvant, '', 'aucune date limite non plus');
  egal(r.joursRestants, '', 'et surtout aucun compte à rebours, qui ferait foi à lui seul');
  verifier(/validées/.test(r.pourquoi), 'la raison est dite : personne n’a vérifié');

  egal(situation({ ...presume, valide: true }).etat, 'Fenêtre ouverte',
    'la même ligne, une fois validée, reprend vie');
}

section('E. Installation');
{
  const contexte = monter();
  const { poses } = contexte.lire('installer_()');
  egal(poses.slice().sort(), ['Contrats', 'Documents écartés', 'Guide', 'Réglages'],
    'quatre onglets posés — le plan des alertes appartient au module, qui le crée');

  const reglages = lignesDe(contexte, 'Réglages').map((l) => String(l['Réglage']));
  ['Dossier des contrats (lien Drive)', 'Appel au modèle', 'Rappels à (jours avant la date limite)']
    .forEach((cle) => verifier(reglages.includes(cle), `le réglage « ${cle} » est posé`));

  const contrats = contexte.feuilles.Contrats;
  const entete = contrats.getRange(1, 1, 1, contrats.getLastColumn()).getValues()[0];
  ['Origine des dates', 'Validé', 'Extrait justificatif', 'Dénoncé le']
    .forEach((c) => verifier(entete.includes(c), `la colonne « ${c} » est là`));

  // Une case à cocher plutôt qu'un « oui » tapé : sur deux cents lignes, on
  // voit d'un coup d'œil ce qui est validé.
  const validee = Object.keys(contrats.validations)
    .some((cle) => contrats.validations[cle].caseACocher);
  verifier(validee, 'la colonne « Validé » porte une case à cocher');

  const guide = lignesDe(contexte, 'Guide').map((l) => String(l.Sujet));
  verifier(guide.some((s) => /règle qui gouverne/i.test(s)),
    'le guide énonce la règle des présomptions — elle doit se lire DANS l’outil, '
    + 'pas seulement dans le README');
  verifier(guide.some((s) => /Conventions de calcul/.test(s)),
    'et les conventions de calcul, qui ne se devinent pas en lisant le résultat');
  verifier(guide.some((s) => /ne fait pas/.test(s)),
    'et ce que l’outil ne fait pas : aucun avis juridique');

  // Deux fois de suite ne doit rien casser ni rien réécrire.
  contexte.lire("SocleFeuilles.ecrireReglage('Réglages', 'Région Vertex', 'europe-west9')");
  contexte.lire('installer_()');
  const apres = contexte.lire("SocleFeuilles.lireReglages('Réglages')['Région Vertex']");
  egal(apres, 'europe-west9', 'une valeur déjà renseignée n’est jamais réécrite');
}

section('F. Lire le dossier ne produit que des présomptions');
{
  const fichiers = { RACINE: [
    { id: 'c1', name: 'Maintenance ascenseurs.pdf', mimeType: 'application/pdf',
      modifiedTime: '2026-01-10T10:00:00.000Z', size: '2048',
      webViewLink: 'https://drive/c1' },
    { id: 'c2', name: 'Plaquette.pdf', mimeType: 'application/pdf',
      modifiedTime: '2026-01-10T10:00:00.000Z', size: '1024',
      webViewLink: 'https://drive/c2' },
  ] };
  const contexte = prepare_({
    fichiers,
    reponsesModele: [
      { texte: JSON.stringify({
        estUnContrat: true, fournisseur: 'Otis', objet: 'Maintenance ascenseurs',
        dateEffet: '2024-03-01', dureeInitialeMois: 12, reconductionMois: 12,
        preavis: 3, unitePreavis: 'mois', montantAnnuel: 8400,
        extrait: 'Le présent contrat est conclu pour une durée de douze mois, '
          + 'renouvelable par tacite reconduction, sauf dénonciation trois mois avant le terme.',
        introuvable: [] }) },
      { texte: JSON.stringify({ estUnContrat: false, extrait: '', introuvable: [] }) },
    ],
  });

  const bilan = contexte.lire('lireLesContratsDuDossier_()');
  egal(bilan.lus, 1, 'un contrat lu');
  egal(bilan.ecartes, 1, 'et une plaquette écartée : ce n’est pas un contrat');
  verifier(bilan.complet, 'le dossier a été lu en entier');
  const ecarte = lignesDe(contexte, 'Documents écartés')[0];
  egal(String(ecarte.Document), 'Plaquette.pdf',
    'le document écarté est consigné — visible, parce qu’un jugement automatique se conteste');

  const ligne = lignesDe(contexte, 'Contrats')[0];
  egal(String(ligne.Contrat), 'Maintenance ascenseurs', 'la ligne porte l’objet du contrat');
  egal(String(ligne['Origine des dates']), 'Lue par le modèle', 'et l’origine de ses dates');
  egal(ligne['Validé'], false, 'décochée : rien n’est acquis');
  verifier(/tacite reconduction/.test(String(ligne['Extrait justificatif'])),
    'avec l’extrait mot pour mot — sans lui, la lecture du modèle ne vaut rien');

  contexte.lire("recalculerLesContrats_('2026-09-13')");
  const calculee = lignesDe(contexte, 'Contrats')[0];
  egal(String(calculee['État']), 'À valider', 'tant que personne n’a coché');
  egal(String(calculee['Prochaine échéance']), '', 'et aucune date n’est affichée');

  // Une personne vérifie, corrige si besoin, coche.
  const numeroValide = contexte.lire(
    "SocleFeuilles.lireTable('Contrats').index['Validé'] + 1");
  contexte.feuilles.Contrats.getRange(2, numeroValide).setValues([[true]]);
  contexte.lire("recalculerLesContrats_('2026-09-13')");
  const validee = lignesDe(contexte, 'Contrats')[0];
  egal(String(validee['État']), 'Fenêtre ouverte', 'la ligne validée reprend vie');
  egal(String(validee['Dénoncer avant le']), '2026-12-01', 'avec sa date limite');
  egal(String(validee['Validé par']), 'moi@exemple.org',
    'et le nom de qui a pris la responsabilité — une validation anonyme n’engage personne');

  // L'avenant : le document change, la validation précédente portait sur un
  // autre texte. La laisser cochée ferait couvrir par une lecture périmée un
  // préavis qui a peut-être changé.
  fichiers.RACINE[0].modifiedTime = '2026-06-20T08:00:00.000Z';
  contexte.reponses.push({ texte: JSON.stringify({
    estUnContrat: true, fournisseur: 'Otis', objet: 'Maintenance ascenseurs',
    dateEffet: '2024-03-01', dureeInitialeMois: 12, reconductionMois: 12,
    preavis: 6, unitePreavis: 'mois', montantAnnuel: 8400,
    extrait: 'Avenant : le préavis est porté à six mois.', introuvable: [] }) });
  contexte.lire('lireLesContratsDuDossier_()');
  const relue = lignesDe(contexte, 'Contrats');
  egal(relue.length, 1, 'le contrat relu ne crée pas de doublon');
  egal(contexte.appels.modele.length, 3,
    'et la plaquette n’est PAS resoumise au modèle : un document écarté se retient, '
    + 'sans quoi il coûte un appel à chaque passage, indéfiniment');
  egal(relue[0]['Validé'], false,
    'et sa validation est REMISE À ZÉRO : elle portait sur le texte d’avant');
  egal(String(relue[0]['Validé par']), '', 'le nom du valideur précédent part avec');
  egal(Number(relue[0]['Préavis']), 6, 'le nouveau préavis est pris');
}

section('G. Le plan des alertes');
{
  const contexte = prepare_();
  const base = {
    'Date d’effet': '2024-03-01', 'Durée initiale (mois)': 12,
    'Reconduction (mois)': 12, 'Préavis': 3, 'Unité du préavis': 'mois',
    'Origine des dates': 'Saisie à la main',
  };
  poser_(contexte, { ...base, Contrat: 'Ascenseurs', Fournisseur: 'Otis',
    'Montant annuel (€)': 8400, Responsable: 'jean@exemple.org' });
  poser_(contexte, { ...base, Contrat: 'Photocopieurs', 'Date d’effet': '2024-11-15',
    Préavis: 1 });
  poser_(contexte, { ...base, Contrat: 'Déjà dénoncé', 'Dénoncé le': '2026-04-02' });
  poser_(contexte, { ...base, Contrat: 'Lu sans validation',
    'Origine des dates': 'Lue par le modèle', 'Validé': false });

  const plan = contexte.lire("construireLePlanDesAlertes_('2026-09-13')");
  const noms = plan.map((l) => l.Contrat);
  verifier(!noms.includes('Déjà dénoncé'), 'un contrat dénoncé ne produit plus d’alerte');
  verifier(noms.includes('Ascenseurs'), 'la fenêtre ouverte en produit une');

  const ascenseurs = plan.find((l) => l.Contrat === 'Ascenseurs');
  egal(ascenseurs.Nature, 'Dénoncer', 'de nature « Dénoncer »');
  egal(ascenseurs.Destinataire, 'jean@exemple.org',
    'adressée au responsable du contrat, pas au destinataire par défaut');
  egal(ascenseurs.Palier, 90, 'au palier franchi le plus proche — 79 jours a passé 90, pas 60');
  verifier(/1er décembre 2026/.test(ascenseurs.Message),
    'et le message porte la date en clair, telle qu’un humain la lit');
  verifier(/8 400 €/.test(ascenseurs.Message.replace(/\u202f|\u00a0/g, ' ')),
    'avec le montant, qui dit si cela vaut qu’on s’en occupe aujourd’hui');

  // La nature « Valider » est ce qui empêche un contrat lu puis oublié de se
  // reconduire en silence. Sans elle, l’outil donnerait l’illusion de veiller.
  const aValider = plan.find((l) => l.Contrat === 'Lu sans validation');
  egal(aValider.Nature, 'Valider', 'un contrat non validé produit une alerte d’une AUTRE nature');
  egal(aValider.Destinataire, 'veille@exemple.org', 'au destinataire par défaut, faute de responsable');
  verifier(/présomptions/.test(aValider.Message), 'le message dit que les dates sont présumées');
  verifier(/AUCUN rappel/.test(aValider.Message),
    'et ce que coûte l’inaction : aucun rappel de dénonciation ne partira');

  // Le plus urgent en tête : un plan se relit du haut.
  const restants = plan.map((l) => Number(l['Jours restants']));
  egal(restants.slice().sort((a, b) => a - b), restants, 'le plan est trié du plus urgent au moins');

  // Un palier déjà envoyé ne se renvoie pas ; un palier plus proche, si.
  contexte.lire(`(() => {
    const t = SocleFeuilles.lireTable('Contrats');
    const l = t.lignes.find((x) => String(x.Contrat) === 'Ascenseurs');
    t.feuille.getRange(l.numero, t.index['Dernier rappel (jours)'] + 1).setValue(90);
  })()`);
  const second = contexte.lire("construireLePlanDesAlertes_('2026-09-13')");
  verifier(!second.some((l) => l.Contrat === 'Ascenseurs'),
    'le palier 90 déjà envoyé ne repart pas le lendemain');
  const plusTard = contexte.lire("construireLePlanDesAlertes_('2026-10-20')");
  const relance = plusTard.find((l) => l.Contrat === 'Ascenseurs');
  egal(relance.Palier, 60, 'mais le palier suivant, lui, repart');
}

section('H. Rien ne part sans qu’une personne ait coché');
{
  const contexte = prepare_();
  poser_(contexte, {
    Contrat: 'Ascenseurs', Fournisseur: 'Otis', 'Date d’effet': '2024-03-01',
    'Durée initiale (mois)': 12, 'Reconduction (mois)': 12, 'Préavis': 3,
    'Unité du préavis': 'mois', 'Origine des dates': 'Saisie à la main',
    Responsable: 'jean@exemple.org',
  });

  contexte.lire("recalculerLesContrats_('2026-09-13')");
  const prepare = contexte.lire('operationDAlerte_().preparer()');
  egal(prepare.lignes, 1, 'une alerte au plan');

  // Le plan porte le message TEL QU’IL PARTIRA. Un plan qui n’afficherait que
  // des adresses demanderait de faire confiance au code, et la validation ne
  // vaudrait plus rien.
  const alerte = lignesDe(contexte, 'Alertes')[0];
  verifier(/se reconduit tacitement/.test(String(alerte.Message)),
    'le message est lisible dans l’onglet avant tout envoi');

  const sansCocher = contexte.lire('operationDAlerte_().appliquer()');
  egal(contexte.appels.courriels.length, 0,
    'appliquer sans avoir coché n’envoie RIEN — c’est tout l’objet du motif');

  // On coche, puis on applique.
  contexte.feuilles.Alertes.getRange(2, 1).setValues([[true]]);
  contexte.lire('operationDAlerte_().appliquer()');
  egal(contexte.appels.courriels.length, 1, 'la ligne cochée part');
  egal(contexte.appels.courriels[0].to, 'jean@exemple.org', 'au bon destinataire');
  verifier(/1er décembre 2026/.test(contexte.appels.courriels[0].body),
    'avec la date limite en clair');

  // Le palier est noté sur le contrat : sans cela, le rappel repartirait demain.
  const contrat = lignesDe(contexte, 'Contrats')[0];
  egal(Number(contrat['Dernier rappel (jours)']), 90, 'et le palier envoyé est noté au contrat');

  // Deux applications de suite n’envoient pas deux fois.
  contexte.lire('operationDAlerte_().appliquer()');
  egal(contexte.appels.courriels.length, 1, 'une seconde application ne renvoie pas');
}

section('I. La veille quotidienne calcule, elle ne décide pas');
{
  const contexte = prepare_();
  poser_(contexte, {
    Contrat: 'Ascenseurs', 'Date d’effet': '2024-03-01', 'Durée initiale (mois)': 12,
    'Reconduction (mois)': 12, 'Préavis': 3, 'Unité du préavis': 'mois',
    'Origine des dates': 'Saisie à la main',
  });

  contexte.lire('poserLaVeilleQuotidienne()');
  egal(contexte.appels.declencheurs.map((d) => d.fonction), ['veilleQuotidienne'],
    'le déclencheur vise une function déclarée — une arrow function serait introuvable');
  egal(contexte.appels.declencheurs[0].heure, 7, 'et tourne au petit matin');
  contexte.lire('poserLaVeilleQuotidienne()');
  egal(contexte.appels.declencheurs.length, 1,
    'la poser deux fois n’en pose pas deux : on retire les siens d’abord, sinon on '
    + 'accumule jusqu’à la limite de vingt déclencheurs par script');

  const bilan = contexte.lire('veilleQuotidienne()');
  egal(bilan.alertes, 1, 'elle voit l’action en attente');
  egal(contexte.appels.courriels.length, 1, 'et prévient une personne');
  verifier(/sans votre validation/.test(contexte.appels.courriels[0].body),
    'en disant que rien ne partira sans validation');

  // Elle ne prépare PAS le plan : `preparer` efface le plan en cours, et le
  // reconstruire chaque nuit balaierait les cases cochées la veille au soir.
  egal(contexte.feuilles.Alertes, undefined,
    'la veille quotidienne ne touche pas au plan des alertes');

  // Ce module veut un verrou de document : dans un script autonome, Google en
  // rend `null` sans rien lever. Le refus doit nommer la cause plutôt que de
  // casser sur « Cannot read properties of null ».
  const autonome = prepare_({ verrouDocumentAbsent: true });
  leve(() => autonome.lire('operationDAlerte_().appliquer()'), /lié à un classeur/,
    'un script non lié à un classeur est refusé, et sait dire pourquoi');
}


console.log(`\n${passes} assertion(s) passée(s), ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  echecs.forEach((e) => console.log(`  · ${e}`));
  process.exit(1);
}
