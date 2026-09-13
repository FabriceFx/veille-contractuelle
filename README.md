<a id="francais"></a>

# Veille contractuelle et tacite reconduction

📖 Français (ci-dessous) · [🇬🇧 English version](#english)

Tient l'inventaire de vos contrats, calcule la date après laquelle chacun se
reconduit tacitement, et alerte avant qu'il soit trop tard. Il peut lire les
contrats d'un dossier Drive pour proposer ces dates — **mais il ne les tient
jamais pour acquises.**

> ⚠️ Cet outil ne donne aucun avis juridique et n'interprète aucune clause. Il
> calcule des dates à partir de ce que vous ou le modèle avez saisi, et affiche
> toujours d'où elles viennent.

## La règle qui gouverne tout

**Une date lue par le modèle est une présomption, pas un fait.**

Tant qu'une personne n'a pas coché « Validé », le contrat n'a ni échéance, ni
date limite, ni compte à rebours. Rien. La colonne « État » dit « À valider »,
et vous recevez une demande de vérification au lieu d'une alerte de
dénonciation.

Ce n'est pas de la prudence décorative. Un compte à rebours affiché dans la
colonne d'un fait devient un fait au bout de trois jours : on le lit, on s'y
fie, on planifie autour. Un outil qui laisserait reconduire un contrat sur la
foi d'une lecture automatique serait **pire que pas d'outil du tout** — on se
croirait couvert.

Le banc le vérifie en réintroduisant le défaut : sans cette règle, une
présomption produit « Fenêtre ouverte, 79 jours restants » sur une date que
personne n'a lue.

Corollaire : **relire un document remet la validation à zéro.** Une validation
porte sur un texte, pas sur un nom de fichier. Un avenant qui porte le préavis
de trois à six mois rendrait la validation précédente fausse sans que rien ne
le signale.

## Deux dates, parce qu'elles ne disent pas la même chose

C'est l'erreur la plus chère du domaine, et la plus facile à commettre.

| Colonne | Ce qu'elle dit |
|---|---|
| **Prochaine échéance** | la date à laquelle le contrat se reconduit |
| **Dénoncer avant le** | le dernier jour de la prochaine fenêtre **encore ouverte** |

Elles diffèrent dès que le préavis de la prochaine échéance est passé. Un
tableau naïf afficherait « échéance : 1er mars 2027 » et laisserait croire
qu'on peut encore agir — alors que cette reconduction-là est jouée, et que la
prochaine occasion est un an plus loin. La colonne « Pourquoi » le dit en
toutes lettres, et l'alerte aussi.

## Conventions de calcul, écrites plutôt que sous-entendues

1. **L'échéance est la date de reconduction**, non le dernier jour de la
   période. Un contrat prenant effet le 1er mars pour douze mois court jusqu'au
   28 février et se reconduit le **1er mars** suivant.
2. **Le dernier jour pour dénoncer est « échéance − préavis »**, ce jour-là
   compris. Un contrat qui exige « plus de trois mois » se règle en portant le
   préavis à quatre.
3. **Ajouter des mois ne déborde jamais sur le mois suivant.** Le 31 janvier
   plus un mois vaut le 28 février, non le 3 mars — ce que fait `setMonth`, en
   silence, décalant toutes les échéances d'un contrat signé un 29, 30 ou 31.
   Le banc éprouve trois ans de pas sur cinq dates pièges.

Le calcul passe par `Date.UTC` : en heure locale, un changement d'heure entre
les deux dates décale le résultat d'un jour, ce qui suffit à faire manquer un
préavis.

## Où partent vos contrats

Deux modes, et ce n'est pas un réglage technique.

- **Vertex AI (projet Cloud)** — par défaut. Le contrat est analysé depuis
  *votre* projet Cloud, avec le jeton OAuth de la personne qui exécute. Il ne
  quitte pas votre périmètre contractuel Google Cloud. Demande un projet Cloud
  et la portée `cloud-platform`.
- **Clé AI Studio** — plus simple à installer, une clé et rien d'autre. Les
  documents envoyés **sortent** de ce périmètre.

Sur des contrats commerciaux, c'est une question pour le juridique avant
l'installation, pas une case à cocher après. L'entrée « À propos » du menu
rappelle en permanence lequel des deux tourne.

La clé ne passe jamais par l'URL : en-tête `x-goog-api-key`, et rangement dans
`PropertiesService` via `SocleSecrets`. Une URL se retrouve dans les journaux
d'exécution, dans ceux du proxy, et dans la barre d'adresse de qui débogue.

## Rien ne part sans qu'une personne ait coché

Un courriel est irréversible : les alertes passent donc par
[`plan-puis-application`](../plan-puis-application). Le plan s'écrit dans un
onglet **avec le message tel qu'il partira**, on le relit, on coche, on
applique. Un plan qui n'afficherait que des adresses demanderait de faire
confiance au code sur ce qu'il compte écrire, et la validation ne vaudrait plus
rien.

Deux natures d'alerte, et il faut les deux :

- **Dénoncer** — la fenêtre est ouverte, les dates sont sûres ;
- **Valider** — un contrat a été lu et personne n'a confirmé ses dates. Sans
  cette seconde nature, un contrat lu puis oublié se reconduirait en silence et
  l'outil aurait donné l'illusion de veiller.

Le palier envoyé est noté sur la ligne du contrat, **après** l'envoi. Si
l'exécution meurt entre les deux, un rappel déjà parti repart : un rappel en
double agace, un rappel perdu coûte une reconduction.

## La veille quotidienne calcule, elle ne décide pas

Le déclencheur recalcule les échéances et prévient quand une action attend. Il
ne prépare ni n'envoie rien : `preparer` efface le plan en cours, et le
reconstruire chaque nuit balaierait les cases cochées la veille au soir.

Ce déclencheur s'exécute sous l'identité de qui l'a posé — les contrats sont
donc lus avec ses droits Drive. C'est dit dans la boîte de dialogue qui le
pose.

## Un document écarté se retient

L'onglet « Documents écartés » liste ce que le modèle n'a pas reconnu comme un
contrat. Il est **visible** exprès : un jugement automatique se conteste, et si
un vrai contrat s'y trouve, on l'ajoute à la main. Sans cet onglet, chaque
plaquette du dossier repartirait au modèle à chaque passage — un coût par
document et par exécution, indéfiniment. Le banc l'a trouvé avant la première
installation.

## Installation

Le projet est **lié au classeur** (Extensions > Apps Script depuis la feuille
de calcul), et non autonome. `onOpen` donne alors le menu sans rien installer,
et chaque action s'exécute sous l'identité de qui la déclenche.

```bash
cd apps-script && clasp push
```

Puis, depuis le classeur : *Veille > Créer / compléter les onglets*, et suivre
l'onglet « Guide ».

### Les portées demandées

| Portée | Pourquoi |
|---|---|
| `spreadsheets.currentonly` | le classeur hôte, et lui seul |
| `drive.readonly` | lister et lire les contrats du dossier |
| `script.external_request` | appeler le modèle |
| `script.send_mail` | `MailApp` — il ne sait qu'envoyer, aucune lecture de la messagerie |
| `script.scriptapp` | poser la veille quotidienne et les reprises |
| `cloud-platform` | Vertex AI. **Large** : elle ne se décline pas en lecture seule. En mode AI Studio, elle peut être retirée du manifeste |

## Le banc

```bash
node banc/test.js
```

101 assertions, sans déploiement : `SpreadsheetApp`, `Drive`, `MailApp`,
`LockService` et `ScriptApp` sont simulés — et **les faux services refusent ce
que les vrais refusent**. C'est ce qui a fait tomber deux défauts avant la
première installation : un `LockService.getDocumentLock()` à `null` dans un
script autonome, et les documents écartés resoumis au modèle indéfiniment.

Toute correction s'accompagne du cas qui l'aurait attrapée, et le défaut est
réintroduit pour vérifier que le banc échoue.

## Ce qui reste à faire

- Éprouvé au banc, **jamais installé en vrai.** Les quatre premiers défauts se
  trouveront là.
- Pas de sortie imprimable de l'échéancier.
- Le mode Vertex n'a pas encore été exercé contre un vrai projet Cloud.

## Licence

Elastic License 2.0 — voir [LICENSE](LICENSE).
Copyright Fabrice Faucheux (https://faucheux.bzh)

---

<a id="english"></a>

# Contract watch and tacit renewal

🇬🇧 English (below) · [📖 Version française](#francais)

Keeps an inventory of your contracts, computes the date after which each one
renews tacitly, and warns you before it is too late. It can read contracts from
a Drive folder to propose those dates — **but it never treats them as settled.**

> ⚠️ This tool gives no legal advice and interprets no clause. It computes
> dates from what you or the model entered, and always shows where they come
> from.

## The rule that governs everything

**A date read by the model is a presumption, not a fact.** Until a person ticks
“Validé”, the contract has no due date, no deadline and no countdown at all.
You get a verification request instead of a termination alert.

A countdown displayed in a fact's column becomes a fact within three days:
people read it, rely on it, plan around it. A tool that let a contract renew on
the strength of an unchecked automatic reading would be **worse than no tool** —
you would believe you were covered.

Re-reading a document resets the validation: it was given on a text, not on a
file name.

## Two dates, because they say different things

“Prochaine échéance” is the renewal date. “Dénoncer avant le” is the last day
of the next window **still open**. They differ as soon as the notice period for
the coming renewal has passed — that renewal is locked in, and the next chance
is a year away. The tool says so rather than letting you believe otherwise.

## Where your contracts go

Vertex AI (default) analyses the contract from *your* Cloud project: it never
leaves your Google Cloud contractual perimeter. The AI Studio key mode is
simpler to install but sends documents outside it. For commercial contracts
that is a question for legal, not a checkbox.

## Nothing is sent until a person ticks

Alerts go through the plan-then-apply pattern: the plan is written to a tab
**with the message exactly as it will be sent**, you read it, you tick, you
apply.

## Test bench

```bash
node banc/test.js
```

101 assertions, no deployment needed. The fake services refuse what the real
ones refuse — which caught two defects before first install.

## Licence

Elastic License 2.0 — see [LICENSE](LICENSE).
Copyright Fabrice Faucheux (https://faucheux.bzh)
