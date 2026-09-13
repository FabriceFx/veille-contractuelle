# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

## [0.1.0] - 2026-09-13

Première version. Éprouvée au banc, **jamais installée en vrai**.

### Ajouté

- **L'inventaire des contrats**, dans un onglet qui fait foi. Le code n'écrit
  que six colonnes calculées ; tout le reste appartient à l'utilisateur, et
  aucune décision humaine n'est jamais réécrite.
- **Le calcul des échéances.** Deux dates distinctes — la reconduction qui
  vient, et le dernier jour de la prochaine fenêtre encore ouverte — parce que
  les confondre fait croire qu'on peut agir sur une reconduction déjà acquise.
- **La règle des présomptions.** Une date lue par le modèle ne produit ni
  échéance, ni date limite, ni compte à rebours tant qu'une personne n'a pas
  coché « Validé ». Relire un document remet la validation à zéro : elle
  portait sur le texte précédent.
- **La lecture des contrats d'un dossier Drive**, avec l'extrait mot pour mot
  sur lequel le modèle s'est appuyé — sans lui, sa lecture ne vaut rien.
- **Deux modes d'appel au modèle.** Vertex AI depuis votre projet Cloud, par
  défaut : le contrat ne quitte pas votre périmètre contractuel. Ou une clé AI
  Studio, plus simple, qui l'en fait sortir. L'entrée « À propos » rappelle en
  permanence lequel tourne.
- **Les alertes par « plan puis application »** : le plan porte le message tel
  qu'il partira, rien ne s'envoie sans qu'une personne ait coché. Deux natures
  — « Dénoncer » quand la fenêtre est ouverte, « Valider » quand un contrat lu
  attend une confirmation. Sans la seconde, un contrat lu puis oublié se
  reconduirait en silence.
- **Une veille quotidienne qui calcule et prévient, sans décider.** Elle ne
  prépare pas le plan : le reconstruire chaque nuit balaierait les cases
  cochées la veille au soir.
- **L'onglet « Documents écartés »**, visible parce qu'un jugement automatique
  se conteste.
- **Un banc de 101 assertions**, sans déploiement. Les faux services refusent
  ce que les vrais refusent.

### Trouvé par le banc avant la première installation

- **Les documents écartés repartaient au modèle à chaque passage.** Un document
  jugé « pas un contrat » n'était mémorisé nulle part : chaque plaquette du
  dossier coûtait un appel, par exécution, indéfiniment. D'où l'onglet.
- **`plan-puis-application` cassait sur un script autonome** —
  `LockService.getDocumentLock()` y rend `null`. Corrigé dans le module en
  0.1.1, qui refuse désormais en nommant la cause.
- **`idDepuisLien_` refusait un identifiant Drive collé nu**, n'acceptant
  qu'une URL. Le cas normal produisait « dossier illisible ».
