// Généré par « npm run build:gas » (web/) à partir de web/src/domain : ne pas modifier à la main.
var SurvEpiImport = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../drive-backup/src/import-entry.js
  var import_entry_exports = {};
  __export(import_entry_exports, {
    planifier: () => planifier
  });

  // src/domain/report.js
  var SORTIES = [
    ["ct_sortie_21j", "21 jours terminés"],
    ["ct_sortie_symptomatiques", "Devenus symptomatiques"],
    ["ct_sortie_confirmes", "Devenus cas confirmés"],
    ["ct_sortie_perdus", "Perdus de vue"],
    ["ct_sortie_deplaces", "Déplacés / transférés"],
    ["ct_sortie_decedes", "Décédés"],
    ["ct_sortie_doublons", "Doublons retirés"]
  ];
  var MATRICE_V21 = "2026-11-09";
  var SOURCES_ALERTES = [
    ["src_ess", "ESS (formations sanitaires)"],
    ["src_communaute", "Communauté"],
    ["src_ra", "Recherche active (RA)"],
    ["src_poe", "PoE / PoC"]
  ];
  var SITES_RA = [
    ["ra_site_hgr", "Hôpital général de référence"],
    ["ra_site_ch", "Centre hospitalier"],
    ["ra_site_cm", "Centre médical"],
    ["ra_site_cs", "Centre de santé"],
    ["ra_site_labo", "Laboratoire"],
    ["ra_site_ps", "Poste de santé"],
    ["ra_site_disp", "Dispensaire"],
    ["ra_site_tradi", "Tradipraticien"],
    ["ra_site_priere", "Maison de prière"],
    ["ra_site_pharma", "Pharmacie"]
  ];
  var SOUS_GROUPES = [
    {
      id: "ppl",
      label: "Personnel de Première Ligne (PPL)",
      court: "PPL",
      bas: "PPL",
      conf: "cas_conf_ppl",
      confDec: "cas_conf_decedes_ppl",
      deces: "deces_ppl",
      gueris: "gueris_ppl",
      base: "base_ppl",
      base_deces: "base_deces_ppl",
      base_gueris: "base_gueris_ppl"
    },
    {
      id: "moins5",
      label: "Enfants de moins de 5 ans",
      court: "< 5 ans",
      bas: "< 5 ans",
      conf: "cas_conf_moins5",
      confDec: "cas_conf_decedes_moins5",
      deces: "deces_moins5",
      gueris: "gueris_moins5",
      base: "base_moins5",
      base_deces: "base_deces_moins5",
      base_gueris: "base_gueris_moins5"
    },
    {
      id: "eleves",
      label: "Élèves",
      court: "Élèves",
      bas: "élèves",
      conf: "cas_conf_eleves",
      confDec: "cas_conf_decedes_eleves",
      deces: "deces_eleves",
      gueris: "gueris_eleves",
      base: "base_eleves",
      base_deces: "base_deces_eleves",
      base_gueris: "base_gueris_eleves"
    }
  ];
  var FIELDS = [
    // 1. Alertes (données agrégées, aucun détail d'alerte stocké)
    {
      key: "alertes_report",
      depuis: MATRICE_V21,
      label: "Report alertes (stock initial)",
      group: "alertes",
      required: true,
      carry: true,
      help: "Alertes non clôturées à l’ouverture : pré-rempli avec le report final de la veille."
    },
    { key: "alertes_vivantes", depuis: MATRICE_V21, label: "Nouvelles alertes vivantes", group: "alertes", required: true },
    { key: "alertes_deces", depuis: MATRICE_V21, label: "Nouvelles alertes décès", group: "alertes", required: true },
    {
      key: "alertes_validees",
      label: "Alertes validées (cas suspects)",
      short: "A",
      group: "alertes",
      required: true,
      aliases: ["Alertes validées du jour"],
      help: "Validées comme cas suspects. Ce chiffre alimente le module Investigations."
    },
    {
      key: "alertes_investiguees",
      depuis: MATRICE_V21,
      label: "Alertes investiguées",
      group: "alertes",
      required: true,
      help: "En principe égal aux investigations réalisées du jour (du jour + reports apurés) : un écart est signalé."
    },
    { key: "suspects_isoles", depuis: MATRICE_V21, label: "Suspects isolés", group: "alertes", required: true },
    { key: "suspects_preleves", depuis: MATRICE_V21, label: "Suspects prélevés", group: "alertes", required: true },
    ...SOURCES_ALERTES.map(([key, label]) => ({ key, label, group: "sources", required: true, depuis: MATRICE_V21 })),
    {
      key: "alertes_report_final",
      depuis: MATRICE_V21,
      label: "Report final (alertes non clôturées)",
      group: "alertes",
      required: true,
      help: "Stock d’alertes encore ouvertes en fin de journée : devient le report de demain."
    },
    // 2. Recherche active
    { key: "ra_planifiees", depuis: MATRICE_V21, label: "Visites planifiées", group: "ra", required: true },
    { key: "ra_realisees_plan", depuis: MATRICE_V21, label: "Visites planifiées réalisées", group: "ra", required: true },
    {
      key: "ra_non_planifiees",
      depuis: MATRICE_V21,
      label: "Visites non planifiées réalisées",
      group: "ra",
      required: true,
      help: "Visites hors plan, enregistrées à part : elles ne comptent pas dans le taux de recherche active."
    },
    ...SITES_RA.map(([key, label]) => ({ key, label, group: "sites", required: false })),
    { key: "ra_ess_dossiers", depuis: MATRICE_V21, label: "ESS : dossiers / registres examinés", group: "ra_ess", required: true },
    { key: "ra_ess_detectees", depuis: MATRICE_V21, label: "ESS : alertes détectées", group: "ra_ess", required: true },
    { key: "ra_ess_validees", depuis: MATRICE_V21, label: "ESS : alertes validées comme cas suspects", group: "ra_ess", required: true },
    { key: "ra_ess_en_cours", depuis: MATRICE_V21, label: "ESS : alertes en cours de validation", group: "ra_ess", required: true },
    { key: "ra_com_detectees", depuis: MATRICE_V21, label: "Communauté : alertes détectées", group: "ra_com", required: true },
    { key: "ra_com_verifiees", depuis: MATRICE_V21, label: "Communauté : alertes vérifiées", group: "ra_com", required: true },
    { key: "ra_com_validees", depuis: MATRICE_V21, label: "Communauté : alertes validées comme cas suspects", group: "ra_com", required: true },
    { key: "ra_com_deces_signales", depuis: MATRICE_V21, label: "Communauté : décès suspects signalés", group: "ra_com", required: true },
    { key: "ra_com_deces_investigues", depuis: MATRICE_V21, label: "Communauté : décès suspects investigués", group: "ra_com", required: true },
    // 3. Situation épidémiologique : événements du jour seulement (les cumuls sont calculés, jamais saisis)
    { key: "cas_conf_vivants", label: "Nouveaux cas confirmés vivants", group: "epi", required: true },
    {
      key: "cas_conf_decedes",
      label: "Nouveaux cas confirmés décédés",
      group: "epi",
      required: true,
      help: "Confirmés ce jour et déjà décédés au moment de la confirmation."
    },
    ...SOUS_GROUPES.flatMap((g) => [
      {
        key: g.conf,
        label: g.id === "ppl" ? "dont PPL" : `dont ${g.id === "moins5" ? "enfants < 5 ans" : "élèves"}`,
        group: "epi",
        required: true,
        sg: g.id,
        help: `${g.id === "ppl" ? "PPL = Personnel de Première Ligne. " : ""}Parmi les nouveaux cas confirmés du jour (vivants + décédés)${g.id === "eleves" ? ", élèves selon la définition validée par la coordination" : ""}.`
      },
      {
        key: g.confDec,
        label: `dont ${g.bas} déjà décédés`,
        group: "epi",
        required: true,
        sg: g.id,
        depuis: MATRICE_V21,
        help: `Parmi les nouveaux ${g.bas} confirmés du jour, décédés au moment de la confirmation.`
      }
    ]),
    {
      key: "deces_parmi_confirmes",
      label: "Nouveaux décès parmi les cas confirmés",
      group: "epi",
      required: true,
      help: "Cas confirmés vivants les jours précédents, décédés aujourd’hui. Ce ne sont pas de nouveaux cas."
    },
    ...SOUS_GROUPES.map((g) => ({
      key: g.deces,
      label: `dont décès de ${g.bas} déjà confirmés`,
      group: "epi",
      required: true,
      sg: g.id,
      help: `Parmi les nouveaux décès de cas déjà confirmés, ${g.bas} confirmés les jours précédents.`
    })),
    { key: "gueris", label: "Nouveaux guéris du jour", group: "epi", required: true },
    ...SOUS_GROUPES.map((g) => ({ key: g.gueris, label: `dont ${g.bas} guéris`, group: "epi", required: true, sg: g.id, help: "Parmi les nouveaux guéris du jour." })),
    {
      key: "deces_non_confirmes",
      label: "Décès probables / communautaires (non confirmés)",
      group: "epi",
      required: false,
      help: "Suivis à part : jamais ajoutés au cumul des décès parmi les cas confirmés ni à la létalité."
    },
    // II. Investigations
    {
      key: "inv_report_entrant",
      label: "Report des investigations entrant",
      short: "R",
      group: "inv",
      required: true,
      carry: true,
      help: "Pré-rempli avec le report sortant de la veille."
    },
    { key: "inv_realisees_jour", label: "Réalisées sur les alertes du jour", short: "Ij", group: "inv", required: true },
    { key: "inv_realisees_report", label: "Réalisées sur le report (reports apurés)", short: "Ir", group: "inv", required: true },
    { key: "inv_moins_24h", label: "Dont réalisées en moins de 24 h", group: "inv", required: false },
    { key: "narratifs_attendus", label: "Narratifs attendus", group: "doc", required: false },
    { key: "narratifs_disponibles", label: "Narratifs disponibles", group: "doc", required: false },
    { key: "mappings_attendus", label: "Mappings attendus", group: "doc", required: false },
    { key: "mappings_disponibles", label: "Mappings disponibles", group: "doc", required: false },
    // Contacts
    {
      key: "ct_report",
      label: "Report des contacts (actifs de la veille)",
      group: "ct",
      required: true,
      carry: true,
      help: "Pré-rempli avec les contacts à suivre de la veille."
    },
    { key: "ct_identifies", label: "Contacts identifiés aujourd’hui", group: "ct", required: true },
    { key: "ct_listes_24h", label: "Contacts listés dans les 24 h", group: "ct", required: true },
    {
      key: "ct_listes_tardifs",
      label: "Contacts listés hors délai (> 24 h)",
      group: "ct",
      required: false,
      help: "Contacts des jours précédents listés aujourd’hui. Entrent dans le suivi mais pas dans le taux de listage."
    },
    ...SORTIES.map(([key, label]) => ({ key, label, group: "sorties", required: true })),
    { key: "ct_vus", label: "Contacts vus", group: "suivi", required: true },
    { key: "ct_nonvus_veille", label: "Non-vus de la veille", group: "suivi", required: false, carry: true },
    { key: "ct_rattrapes", label: "dont rattrapés aujourd’hui", group: "suivi", required: false },
    { key: "reco_actifs", label: "RECO actifs", group: "reco", required: true },
    { key: "superviseurs_reco", label: "Superviseurs RECO", group: "reco", required: false }
  ];
  var FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  var NUM_KEYS = FIELDS.map((f) => f.key);
  var isHistorique = (r) => !!r && r.source === "historique";
  var n = (v) => v === null || v === void 0 || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  var z = (v) => {
    var _a;
    return (_a = n(v)) != null ? _a : 0;
  };
  var ratio = (num2, den) => den > 0 ? num2 / den : null;
  function carryOver(prev) {
    var _a;
    if (!prev) return { inv_report_entrant: 0, ct_report: 0, ct_nonvus_veille: 0, alertes_report: 0 };
    const c = compute(prev);
    return {
      inv_report_entrant: c.inv_report_sortant,
      ct_report: c.ct_a_suivre,
      ct_nonvus_veille: c.ct_non_vus,
      alertes_report: (_a = n(prev.alertes_report_final)) != null ? _a : 0
    };
  }
  function compute(r) {
    const A = z(r.alertes_validees), R = z(r.inv_report_entrant);
    const Ij = z(r.inv_realisees_jour), Ir = z(r.inv_realisees_report);
    const sorties = SORTIES.reduce((s, [k]) => s + z(r[k]), 0);
    const entrees = z(r.ct_report) + z(r.ct_listes_24h) + z(r.ct_listes_tardifs);
    const aSuivre = entrees - sorties;
    const vus = z(r.ct_vus);
    const nonVus = Math.max(0, aSuivre - vus);
    const alertesJour = z(r.alertes_vivantes) + z(r.alertes_deces);
    const sourcesTotal = SOURCES_ALERTES.reduce((a, [k]) => a + z(r[k]), 0);
    const sitesTotal = SITES_RA.reduce((a, [k]) => a + z(r[k]), 0);
    return {
      alertes_jour: alertesJour,
      alertes_a_traiter: z(r.alertes_report) + alertesJour,
      alertes_cloturees: Math.max(0, z(r.alertes_report) + alertesJour - z(r.alertes_report_final)),
      sources_total: sourcesTotal,
      taux_validation_alertes: ratio(z(r.alertes_validees), z(r.alertes_report) + alertesJour),
      part_preleves: ratio(z(r.suspects_preleves), z(r.suspects_isoles)),
      ra_visites: z(r.ra_realisees_plan) + z(r.ra_non_planifiees),
      ra_sites_total: sitesTotal,
      taux_ra: ratio(z(r.ra_realisees_plan), z(r.ra_planifiees)),
      cas_conf_total: z(r.cas_conf_vivants) + z(r.cas_conf_decedes),
      deces_confirmes_jour: z(r.cas_conf_decedes) + z(r.deces_parmi_confirmes),
      inv_non_faites: Math.max(0, A - Ij),
      inv_report_restant: Math.max(0, R - Ir),
      inv_report_sortant: Math.max(0, A - Ij) + Math.max(0, R - Ir),
      inv_total_realisees: Ij + Ir,
      taux_inv: ratio(Ij, A),
      taux_inv_24h: ratio(z(r.inv_moins_24h), Ij + Ir),
      taux_narratifs: ratio(z(r.narratifs_disponibles), z(r.narratifs_attendus)),
      taux_mappings: ratio(z(r.mappings_disponibles), z(r.mappings_attendus)),
      ct_sorties: sorties,
      ct_entrees: entrees,
      ct_a_suivre: aSuivre,
      ct_non_vus: nonVus,
      ct_non_listes_24h: Math.max(0, z(r.ct_identifies) - z(r.ct_listes_24h)),
      taux_listage: ratio(z(r.ct_listes_24h), z(r.ct_identifies)),
      taux_suivi: ratio(vus, aSuivre),
      taux_nonvus: ratio(nonVus, aSuivre),
      taux_rattrapage: ratio(z(r.ct_rattrapes), z(r.ct_nonvus_veille)),
      taux_sortie_21j: null
      // nécessite le registre (contacts arrivés à J21)
    };
  }
  function validate(r, { prev = null, seuilSuivi = 0.8 } = {}) {
    var _a, _b;
    const errors = [], warnings = [];
    const c = compute(r);
    const val = (k) => n(r[k]);
    const E = (field, msg) => errors.push({ field, msg });
    const W = (field, msg) => warnings.push({ field, msg });
    for (const f of FIELDS) {
      const v = val(f.key);
      if (v !== null && (v < 0 || !Number.isInteger(v))) E(f.key, `${f.label} : entier positif attendu.`);
    }
    const alertesTraitables = z(r.alertes_report) + c.alertes_jour;
    const alertesSaisies = ["alertes_report", "alertes_vivantes", "alertes_deces"].some((k) => val(k) !== null);
    if (alertesSaisies && val("alertes_validees") !== null && val("alertes_validees") > alertesTraitables)
      E("alertes_validees", `Alertes validées (${val("alertes_validees")}) > report + alertes du jour (${alertesTraitables}).`);
    if (alertesSaisies && val("alertes_investiguees") !== null && val("alertes_investiguees") > alertesTraitables)
      E("alertes_investiguees", `Alertes investiguées (${val("alertes_investiguees")}) > report + alertes du jour (${alertesTraitables}).`);
    if (val("suspects_preleves") !== null && val("alertes_validees") !== null && val("suspects_preleves") > z(r.alertes_validees))
      E("suspects_preleves", `Suspects prélevés (${val("suspects_preleves")}) > alertes validées (${z(r.alertes_validees)}).`);
    if (SOURCES_ALERTES.some(([k]) => val(k) !== null) && c.sources_total !== c.alertes_jour)
      E("src_ess", `Somme des sources (${c.sources_total}) ≠ alertes du jour (${c.alertes_jour}).`);
    if (val("alertes_report_final") !== null && val("alertes_report_final") > alertesTraitables)
      E("alertes_report_final", `Report final (${val("alertes_report_final")}) > report + alertes du jour (${alertesTraitables}).`);
    if (val("ra_realisees_plan") !== null && val("ra_realisees_plan") > z(r.ra_planifiees))
      E("ra_realisees_plan", `Visites planifiées réalisées (${val("ra_realisees_plan")}) > visites planifiées (${z(r.ra_planifiees)}). Les visites hors plan vont dans « non planifiées ».`);
    if (val("ra_ess_detectees") !== null && z(r.ra_ess_validees) + z(r.ra_ess_en_cours) > val("ra_ess_detectees"))
      E("ra_ess_validees", `ESS : validées + en cours (${z(r.ra_ess_validees) + z(r.ra_ess_en_cours)}) > alertes détectées (${val("ra_ess_detectees")}).`);
    if (val("ra_com_verifiees") !== null && val("ra_com_verifiees") > z(r.ra_com_detectees))
      E("ra_com_verifiees", `Communauté : vérifiées (${val("ra_com_verifiees")}) > détectées (${z(r.ra_com_detectees)}).`);
    if (val("ra_com_validees") !== null && val("ra_com_validees") > z(r.ra_com_verifiees))
      E("ra_com_validees", `Communauté : validées (${val("ra_com_validees")}) > vérifiées (${z(r.ra_com_verifiees)}).`);
    if (val("ra_com_deces_investigues") !== null && val("ra_com_deces_investigues") > z(r.ra_com_deces_signales))
      E("ra_com_deces_investigues", `Décès suspects investigués (${val("ra_com_deces_investigues")}) > signalés (${z(r.ra_com_deces_signales)}).`);
    for (const g of SOUS_GROUPES) {
      if (val(g.conf) !== null && val(g.conf) > c.cas_conf_total)
        E(g.conf, `${g.court} (${val(g.conf)}) > nouveaux cas confirmés du jour (${c.cas_conf_total}).`);
      if (val(g.confDec) !== null && val(g.confDec) > Math.min(z(r[g.conf]), z(r.cas_conf_decedes)))
        E(g.confDec, `${g.court} déjà décédés (${val(g.confDec)}) > ${g.court} confirmés du jour (${z(r[g.conf])}) ou confirmés décédés (${z(r.cas_conf_decedes)}).`);
      if (val(g.deces) !== null && val(g.deces) > z(r.deces_parmi_confirmes))
        E(g.deces, `Décès de ${g.court} déjà confirmés (${val(g.deces)}) > nouveaux décès parmi les confirmés (${z(r.deces_parmi_confirmes)}).`);
      if (val(g.gueris) !== null && val(g.gueris) > ((_a = val("gueris")) != null ? _a : 0))
        E(g.gueris, `Guéris ${g.court} (${val(g.gueris)}) > nouveaux guéris (${(_b = val("gueris")) != null ? _b : 0}).`);
    }
    const casAs = (r.cas_par_as || []).reduce((a, x) => a + z(x.n), 0);
    if ((r.cas_par_as || []).length && casAs !== c.cas_conf_total)
      E("cas_par_as", `Cas répartis par aire de santé (${casAs}) ≠ nouveaux cas confirmés (${c.cas_conf_total}).`);
    if (val("inv_realisees_jour") !== null && val("alertes_validees") !== null && val("inv_realisees_jour") > val("alertes_validees"))
      E("inv_realisees_jour", "Investigations réalisées du jour (Ij) > alertes validées (A).");
    if (val("inv_realisees_report") !== null && val("inv_report_entrant") !== null && val("inv_realisees_report") > val("inv_report_entrant"))
      E("inv_realisees_report", "Reports apurés (Ir) > report entrant (R).");
    if (val("inv_moins_24h") !== null && val("inv_moins_24h") > c.inv_total_realisees)
      E("inv_moins_24h", "Réalisées en moins de 24 h > investigations réalisées.");
    if (val("narratifs_disponibles") !== null && val("narratifs_disponibles") > z(r.narratifs_attendus))
      E("narratifs_disponibles", "Narratifs disponibles > attendus.");
    if (val("mappings_disponibles") !== null && val("mappings_disponibles") > z(r.mappings_attendus))
      E("mappings_disponibles", "Mappings disponibles > attendus.");
    if (val("ct_listes_24h") !== null && val("ct_identifies") !== null && val("ct_listes_24h") > val("ct_identifies"))
      E("ct_listes_24h", "Contacts listés ≤ 24 h > contacts identifiés.");
    if (c.ct_sorties > c.ct_entrees)
      E("ct_sortie_21j", `Sorties (${c.ct_sorties}) > report + listés (${c.ct_entrees}).`);
    if (val("ct_vus") !== null && val("ct_vus") > Math.max(0, c.ct_a_suivre))
      E("ct_vus", `Contacts vus (${val("ct_vus")}) > contacts à suivre (${c.ct_a_suivre}).`);
    if (val("ct_rattrapes") !== null && val("ct_rattrapes") > z(r.ct_nonvus_veille))
      E("ct_rattrapes", "Rattrapés > non-vus de la veille.");
    const hist = isHistorique(r);
    if (!hist && c.inv_report_sortant > 0 && !(r.motifs_inv || []).length)
      E("motifs_inv", `${c.inv_report_sortant} investigation(s) restent non faites : motif obligatoire.`);
    if ((r.motifs_inv || []).includes("autre") && !String(r.motif_autre || "").trim())
      E("motif_autre", "Préciser le motif « Autre ».");
    if (!hist && c.ct_non_vus > 0 && !(r.motifs_suivi || []).length)
      E("motifs_suivi", `${c.ct_non_vus} contact(s) non vus : motif de non-suivi obligatoire.`);
    if (prev && !hist) {
      const carry = carryOver(prev);
      if (val("inv_report_entrant") !== null && val("inv_report_entrant") !== carry.inv_report_entrant && !String(r.justif_report_inv || "").trim())
        E("justif_report_inv", `Report entrant modifié (veille : ${carry.inv_report_entrant}) : justification obligatoire.`);
      if (val("ct_report") !== null && val("ct_report") !== carry.ct_report && !String(r.justif_report_ct || "").trim())
        E("justif_report_ct", `Report contacts modifié (veille : ${carry.ct_report}) : justification obligatoire.`);
      if (n(prev.alertes_report_final) !== null && val("alertes_report") !== null && val("alertes_report") !== carry.alertes_report && !String(r.justif_report_alertes || "").trim())
        E("justif_report_alertes", `Report alertes modifié (report final de la veille : ${carry.alertes_report}) : justification obligatoire.`);
    }
    if (val("alertes_investiguees") !== null && val("inv_realisees_jour") !== null && val("alertes_investiguees") !== c.inv_total_realisees)
      W("alertes_investiguees", `Alertes investiguées (${val("alertes_investiguees")}) ≠ investigations réalisées du jour (${c.inv_total_realisees}, du jour + reports apurés).`);
    if (val("src_ra") !== null && val("ra_ess_detectees") !== null && val("ra_com_detectees") !== null && val("src_ra") !== z(r.ra_ess_detectees) + z(r.ra_com_detectees))
      W("src_ra", `Alertes de source RA (${val("src_ra")}) ≠ alertes détectées par la recherche active (ESS + communauté : ${z(r.ra_ess_detectees) + z(r.ra_com_detectees)}).`);
    if (SITES_RA.some(([k]) => val(k) !== null) && c.ra_sites_total !== c.ra_visites)
      W("ra_site_hgr", `Somme des types de sites (${c.ra_sites_total}) ≠ visites réalisées (${c.ra_visites}, plan + hors plan).`);
    if (c.cas_conf_total > 0 && !(r.cas_par_as || []).length)
      W("cas_par_as", "Nouveaux cas confirmés sans répartition par aire de santé.");
    if (c.taux_suivi !== null && c.taux_suivi < seuilSuivi)
      W("ct_vus", `Taux de suivi ${(c.taux_suivi * 100).toFixed(0)} % sous le seuil de ${(seuilSuivi * 100).toFixed(0)} %.`);
    if (z(r.ct_identifies) > 0 && c.inv_total_realisees === 0)
      W("ct_identifies", "Contacts identifiés sans aucune investigation réalisée ce jour.");
    if (c.ct_non_listes_24h > 0)
      W("ct_listes_24h", `${c.ct_non_listes_24h} contact(s) identifiés non listés dans les 24 h.`);
    if (val("narratifs_attendus") !== null && val("narratifs_attendus") > 0 && z(r.narratifs_disponibles) < val("narratifs_attendus"))
      W("narratifs_disponibles", "Narratifs manquants.");
    if (val("reco_actifs") === 0 && c.ct_a_suivre > 0)
      W("reco_actifs", "Contacts à suivre sans RECO actif déclaré.");
    return { errors, warnings, needsComment: warnings.length > 0 && !String(r.commentaire || "").trim() };
  }

  // src/domain/importComptes.js
  var norm = (v) => String(v != null ? v : "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  var txt = (v) => v instanceof Date ? "" : String(v != null ? v : "").trim();
  function dateFrom(v) {
    if (v === "" || v === null || v === void 0) return { value: null };
    const p2 = (n2) => String(n2).padStart(2, "0");
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const d2 = new Date(v.getTime() + 12 * 36e5);
      return { value: `${d2.getFullYear()}-${p2(d2.getMonth() + 1)}-${p2(d2.getDate())}` };
    }
    if (typeof v === "number" && v > 2e4 && v < 8e4) {
      const d2 = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return { value: d2.toISOString().slice(0, 10) };
    }
    const s = txt(v);
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return { value: `${m[3]}-${p2(m[2])}-${p2(m[1])}` };
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { value: `${m[1]}-${m[2]}-${m[3]}` };
    return { error: `date illisible « ${s} » (format JJ/MM/AAAA)` };
  }

  // src/domain/time.js
  function addDays(dateStr, n2) {
    const d2 = /* @__PURE__ */ new Date(dateStr + "T00:00:00Z");
    d2.setUTCDate(d2.getUTCDate() + n2);
    return d2.toISOString().slice(0, 10);
  }

  // src/domain/historique.js
  var CARRY_KEYS = ["inv_report_entrant", "ct_report", "ct_nonvus_veille"];
  var MOTIF_FIELDS = ["motifs_inv", "motifs_suivi", "motif_autre", "justif_report_inv", "justif_report_ct"];
  var HIST_HEADERS = [
    ["date", "Date"],
    ["zs", "Zone de santé"],
    ...FIELDS.map((f) => [f.key, f.label]),
    ["nouvelles_as", "Nouvelles AS touchées"],
    ["commentaire", "Commentaire"],
    ["source_detail", "Source"]
  ];
  var isBlank = (v) => v === "" || v === null || v === void 0;
  var zsFinder = (zsList) => {
    const m = /* @__PURE__ */ new Map();
    for (const z2 of zsList) {
      m.set(norm(z2.nom), z2);
      m.set(norm(z2.id), z2);
      if (z2.code_dhis2) m.set(norm(z2.code_dhis2), z2);
    }
    return (name) => m.get(norm(name));
  };
  function headerKey(h) {
    const n2 = norm(h);
    if (!n2) return null;
    for (const [key, label] of HIST_HEADERS) if (n2 === norm(label) || n2 === norm(key)) return key;
    for (const f of FIELDS) if ((f.aliases || []).some((a) => n2 === norm(a) || n2.startsWith(norm(a)))) return f.key;
    for (const [key, label] of HIST_HEADERS) if (n2.startsWith(norm(label))) return key;
    if (n2.startsWith("zone") || n2 === "zs") return "zs";
    return null;
  }
  function num(v) {
    if (isBlank(v)) return { value: null };
    const s = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isInteger(s) && s >= 0 ? { value: s } : { error: `« ${v} » n’est pas un nombre entier positif` };
  }
  function parseModele(rows, zsList) {
    const findZs = zsFinder(zsList);
    const out = [];
    rows.forEach((row, i) => {
      if (Object.values(row).every(isBlank)) return;
      const line = i + 2, errors = [], values = {};
      let date = null, zs = null, commentaire = "", source_detail = "", asNoms = null;
      for (const [h, v] of Object.entries(row)) {
        const k = headerKey(h);
        if (!k) continue;
        if (k === "date") {
          const d2 = dateFrom(v);
          if (d2.error) errors.push(`date : ${d2.error}`);
          else date = d2.value;
        } else if (k === "zs") {
          if (!isBlank(v)) {
            zs = findZs(v);
            if (!zs) errors.push(`ZS inconnue « ${v} »`);
          }
        } else if (k === "commentaire") commentaire = String(v != null ? v : "").trim();
        else if (k === "source_detail") source_detail = String(v != null ? v : "").trim();
        else if (k === "nouvelles_as") {
          if (!isBlank(v)) asNoms = String(v).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
        } else {
          const r = num(v);
          if (r.error) errors.push(`${FIELDS.find((f) => f.key === k).label} : ${r.error}`);
          else if (r.value !== null) values[k] = r.value;
        }
      }
      if (!date && !errors.some((e) => e.startsWith("date"))) errors.push("date manquante");
      if (!zs && !errors.some((e) => e.startsWith("ZS"))) errors.push("ZS manquante");
      out.push({ origine: "modele", line, date, zs_id: (zs == null ? void 0 : zs.id) || null, values, asNoms, commentaire, source_detail, errors });
    });
    return out;
  }
  function tableFrom(arrays, mustHave) {
    const i = arrays.findIndex((r) => (r || []).some((c) => norm(c) === norm(mustHave)));
    if (i < 0) return [];
    const head = arrays[i].map((c) => String(c != null ? c : "").trim());
    return arrays.slice(i + 1).map((r) => Object.fromEntries(head.map((h, j) => {
      var _a;
      return [h, (_a = (r || [])[j]) != null ? _a : ""];
    }))).filter((o) => Object.values(o).some((v) => !isBlank(v)));
  }
  var col = (row, ...names) => {
    for (const n2 of names) for (const k of Object.keys(row)) if (norm(k) === norm(n2) || norm(k).startsWith(norm(n2))) return row[k];
    return "";
  };
  var d = (v) => dateFrom(v).value || null;
  function deriveFromDps({ inv = [], contacts = [], suivi = [] }, zsList, today) {
    var _a, _b, _c;
    const findZs = zsFinder(zsList);
    const cells = /* @__PURE__ */ new Map();
    const zsDates = /* @__PURE__ */ new Map();
    const notes = { zsInconnues: /* @__PURE__ */ new Set(), sansDate: 0, sortiesSansDate: 0, clampIr: 0, clampVus: 0, confirmes: 0, lignes: { inv: 0, contacts: 0, suivi: 0 } };
    const avecClassif = /* @__PURE__ */ new Set();
    const asPremier = /* @__PURE__ */ new Map();
    const cell = (zs, date) => {
      const k = `${zs}|${date}`;
      if (!cells.has(k)) cells.set(k, { A: 0, Ij: 0, Ir: 0, m24: 0, CV: 0, CD: 0, L: 0, s21: 0, ssym: 0, sper: 0, sdep: 0, vus: /* @__PURE__ */ new Set(), agents: /* @__PURE__ */ new Set() });
      const z2 = zsDates.get(zs) || { min: date, max: date, suivi: false };
      if (date < z2.min) z2.min = date;
      if (date > z2.max) z2.max = date;
      zsDates.set(zs, z2);
      return cells.get(k);
    };
    const zsOf = (row) => {
      const v = col(row, "Zone de santé");
      if (isBlank(v)) return null;
      const z2 = findZs(v);
      if (!z2) notes.zsInconnues.add(String(v).trim());
      return z2;
    };
    const ok = (date) => date && date <= today;
    for (const r of inv) {
      const z2 = zsOf(r);
      if (!z2) continue;
      if (norm(col(r, "Statut investigation")) === norm("Non retenue")) continue;
      const da = d(col(r, "Date notification DPS")) || d(col(r, "Date alerte"));
      if (!ok(da)) {
        notes.sansDate++;
        continue;
      }
      notes.lignes.inv++;
      cell(z2.id, da).A++;
      const classif = norm(col(r, "Classification finale"));
      if (classif) avecClassif.add(z2.id);
      if (classif === norm("Confirmé")) {
        const dc = [d(col(r, "Date résultat")), d(col(r, "Date prélèvement")), da].find(ok) || da;
        const decede = norm(col(r, "Type événement")) === norm("Décès");
        cell(z2.id, dc)[decede ? "CD" : "CV"]++;
        notes.confirmes++;
        const nomAs = String((_a = col(r, "Aire de santé")) != null ? _a : "").trim();
        if (nomAs) {
          if (!asPremier.has(z2.id)) asPremier.set(z2.id, /* @__PURE__ */ new Map());
          const m = asPremier.get(z2.id), k = norm(nomAs);
          if (!m.has(k) || m.get(k).date > dc) m.set(k, { nom: nomAs, date: dc });
        }
      }
      const di = d(col(r, "Date début investigation"));
      if (ok(di)) {
        const jour = di < da ? da : di;
        if (jour === da) cell(z2.id, da).Ij++;
        else cell(z2.id, jour).Ir++;
        if (jour <= addDays(da, 1)) cell(z2.id, jour).m24++;
      }
    }
    for (const r of contacts) {
      const z2 = zsOf(r);
      if (!z2) continue;
      const dl = d(col(r, "Date début suivi"));
      if (!ok(dl)) {
        notes.sansDate++;
        continue;
      }
      notes.lignes.contacts++;
      cell(z2.id, dl).L++;
      const statut = norm(col(r, "Statut contact")), issue = norm(col(r, "Issue du suivi"));
      const derniere = d(col(r, "Dernière visite")), fin = d(col(r, "Date fin prévue")), sympt = d(col(r, "Date début symptômes"));
      let type = null, date = null;
      if (statut === "fin de suivi" || issue.startsWith("termine")) {
        type = "s21";
        date = fin || derniere;
      } else if (statut.startsWith("devenu suspect") || issue.startsWith("suspect")) {
        type = "ssym";
        date = sympt || derniere;
      } else if (statut.startsWith("perdu") || issue.startsWith("perdu")) {
        type = "sper";
        date = derniere || fin;
      } else if (statut.startsWith("transfer")) {
        type = "sdep";
        date = derniere;
      }
      if (type) {
        if (!ok(date)) {
          if (!date) notes.sortiesSansDate++;
          continue;
        }
        cell(z2.id, date < dl ? dl : date)[type]++;
      }
    }
    for (const r of suivi) {
      const z2 = zsOf(r);
      if (!z2) continue;
      const dv = d(col(r, "Date"));
      if (!ok(dv)) continue;
      notes.lignes.suivi++;
      const c = cell(z2.id, dv);
      zsDates.get(z2.id).suivi = true;
      if (norm(col(r, "Vu/Joint", "Vu")) === "oui") c.vus.add(String(col(r, "ID contact")) || `l${notes.lignes.suivi}`);
      const ag = String((_b = col(r, "Agent de suivi")) != null ? _b : "").trim();
      if (ag) c.agents.add(norm(ag));
    }
    const out = [];
    for (const [zs, r] of zsDates) {
      for (let date = r.min; date <= r.max; date = addDays(date, 1)) {
        const c = cells.get(`${zs}|${date}`) || { A: 0, Ij: 0, Ir: 0, m24: 0, CV: 0, CD: 0, L: 0, s21: 0, ssym: 0, sper: 0, sdep: 0, vus: /* @__PURE__ */ new Set(), agents: /* @__PURE__ */ new Set() };
        const epi = avecClassif.has(zs) ? { cas_conf_vivants: c.CV || 0, cas_conf_decedes: c.CD || 0 } : {};
        const asNoms = avecClassif.has(zs) ? [...((_c = asPremier.get(zs)) == null ? void 0 : _c.values()) || []].filter((x) => x.date === date).map((x) => x.nom) : null;
        const values = {
          ...epi,
          alertes_validees: c.A,
          inv_realisees_jour: c.Ij,
          inv_realisees_report: c.Ir,
          inv_moins_24h: c.m24,
          ct_identifies: c.L,
          ct_listes_24h: c.L,
          ct_listes_tardifs: 0,
          ct_sortie_21j: c.s21,
          ct_sortie_symptomatiques: c.ssym,
          ct_sortie_confirmes: 0,
          ct_sortie_perdus: c.sper,
          ct_sortie_deplaces: c.sdep,
          ct_sortie_decedes: 0,
          ct_sortie_doublons: 0
        };
        if (r.suivi) {
          values.ct_vus = c.vus.size;
          values.reco_actifs = c.agents.size;
        }
        out.push({ origine: "dps", line: null, date, zs_id: zs, values, asNoms, commentaire: "", source_detail: "Outils Excel DPS (recalculé)", errors: [] });
      }
    }
    return { fiches: out, notes: { ...notes, zsInconnues: [...notes.zsInconnues] } };
  }
  function buildPlan({ modele = [], dps = [] }, { reports = [], zsList = [], today, areas = [] }) {
    var _a;
    const zsName = Object.fromEntries(zsList.map((z2) => [z2.id, z2.nom]));
    const existing = new Map(reports.map((r) => [`${r.date}|${r.zs_id}`, r]));
    const merged = /* @__PURE__ */ new Map();
    const invalid = [];
    for (const f of dps) merged.set(`${f.date}|${f.zs_id}`, { ...f, values: { ...f.values }, fromDps: new Set(Object.keys(f.values)), errors: [], sources: ["Outils DPS"] });
    const seen = /* @__PURE__ */ new Map();
    for (const f of modele) {
      if (f.errors.length || !f.date || !f.zs_id) {
        invalid.push({ ...f, key: `l${f.line}`, action: "erreur", warnings: [], calcules: [] });
        continue;
      }
      const key = `${f.date}|${f.zs_id}`;
      if (seen.has(key)) {
        invalid.push({ ...f, key: `l${f.line}`, action: "erreur", errors: [`déjà donnée ligne ${seen.get(key)} (même date et même ZS)`], warnings: [], calcules: [] });
        continue;
      }
      seen.set(key, f.line);
      const base = merged.get(key);
      if (base) {
        for (const k of Object.keys(f.values)) base.fromDps.delete(k);
        Object.assign(base.values, f.values);
        if (f.asNoms) {
          base.asNoms = f.asNoms;
          base.asModele = true;
        }
        Object.assign(base, { line: f.line, origine: "mixte", commentaire: f.commentaire || base.commentaire, source_detail: f.source_detail || base.source_detail });
        base.sources.unshift(f.source_detail || "Modèle");
      } else merged.set(key, { ...f, values: { ...f.values }, fromDps: /* @__PURE__ */ new Set(), asModele: !!f.asNoms, sources: [f.source_detail || "Modèle"] });
    }
    const remplacees = new Set([...merged.keys()].filter((k) => {
      var _a2;
      return ((_a2 = existing.get(k)) == null ? void 0 : _a2.source) === "historique";
    }));
    const asAilleurs = /* @__PURE__ */ new Map();
    for (const r of reports) {
      if (remplacees.has(`${r.date}|${r.zs_id}`)) continue;
      for (const id of r.nouvelles_as || []) asAilleurs.set(id, r.date);
    }
    const asParNom = new Map(areas.map((a) => [`${a.zs_id}|${norm(a.nom)}`, a]));
    const byZs = /* @__PURE__ */ new Map();
    for (const f of merged.values()) {
      if (!byZs.has(f.zs_id)) byZs.set(f.zs_id, []);
      byZs.get(f.zs_id).push(f);
    }
    const rows = [];
    for (const [zs_id, list] of byZs) {
      list.sort((a, b) => a.date < b.date ? -1 : 1);
      let prev = null;
      const asLot = /* @__PURE__ */ new Map();
      for (const f of list) {
        const errors = [...f.errors], warnings = [], calcules = [];
        const record = { date: f.date, zs_id, source: "historique", rapport_nul: false, commentaire: f.commentaire || null, source_detail: f.sources.join(" + ").slice(0, 300), nouvelles_as: [] };
        for (const k of NUM_KEYS) record[k] = (_a = f.values[k]) != null ? _a : null;
        for (const nom of f.asNoms || []) {
          const a = asParNom.get(`${zs_id}|${norm(nom)}`);
          if (!a) {
            const msg = `AS « ${nom} » absente de la liste de la ZS (à ajouter dans ZS & acteurs > Aires de santé)`;
            if (f.asModele) errors.push(msg);
            else warnings.push(`${msg} : non comptée`);
            continue;
          }
          const avant = (a.touchee_le && a.touchee_le <= f.date ? a.touchee_le : null) || asAilleurs.get(a.id) || asLot.get(a.id);
          if (avant) {
            warnings.push(`AS ${a.nom} déjà touchée (${avant}) : pas recomptée`);
            continue;
          }
          if (!record.nouvelles_as.includes(a.id)) record.nouvelles_as.push(a.id);
        }
        let veille = prev && prev.date >= addDays(f.date, -14) ? prev.record : null;
        if (!veille) for (let i = 1; i <= 14 && !veille; i++) {
          const r = existing.get(`${addDays(f.date, -i)}|${zs_id}`);
          if (r) veille = r;
        }
        const c0 = veille ? compute(veille) : null;
        const carry = { inv_report_entrant: c0 ? c0.inv_report_sortant : 0, ct_report: c0 ? c0.ct_a_suivre : 0, ct_nonvus_veille: c0 ? c0.ct_non_vus : 0 };
        for (const k of CARRY_KEYS) if (record[k] === null) {
          record[k] = Math.max(0, carry[k]);
          calcules.push(k);
        }
        if (!veille && calcules.length) warnings.push("pas de jour précédent connu : reports de départ à 0");
        if (f.fromDps.has("inv_realisees_report") && record.inv_realisees_report > record.inv_report_entrant) {
          warnings.push(`reports apurés ramenés de ${record.inv_realisees_report} à ${record.inv_report_entrant} (registre incomplet avant cette date)`);
          record.inv_realisees_report = record.inv_report_entrant;
        }
        if (record.inv_moins_24h !== null && record.inv_moins_24h > (record.inv_realisees_jour || 0) + (record.inv_realisees_report || 0)) record.inv_moins_24h = (record.inv_realisees_jour || 0) + (record.inv_realisees_report || 0);
        const c1 = compute(record);
        if (f.fromDps.has("ct_vus") && record.ct_vus > Math.max(0, c1.ct_a_suivre)) {
          warnings.push(`contacts vus ramenés de ${record.ct_vus} à ${Math.max(0, c1.ct_a_suivre)} (visites de contacts absents du registre)`);
          record.ct_vus = Math.max(0, c1.ct_a_suivre);
        }
        if (c1.ct_sorties > c1.ct_entrees && [...f.fromDps].some((k) => k.startsWith("ct_sortie"))) {
          warnings.push("sorties supérieures aux contacts suivis : sorties remises à 0 ce jour (registre incomplet)");
          for (const k of FIELDS.filter((x) => x.key.startsWith("ct_sortie")).map((x) => x.key)) if (f.fromDps.has(k)) record[k] = 0;
        }
        if (record.ct_rattrapes !== null && record.ct_rattrapes > (record.ct_nonvus_veille || 0)) errors.push("rattrapés > non-vus de la veille");
        if (f.date > today) errors.push("date future");
        const v = validate(record, { seuilSuivi: 0 });
        for (const e of v.errors) if (!MOTIF_FIELDS.includes(e.field)) errors.push(e.msg);
        const ex = existing.get(`${f.date}|${zs_id}`);
        const action = errors.length ? "erreur" : ex && ex.source !== "historique" ? "ignoree" : ex ? "remplace" : "nouvelle";
        if (action === "ignoree") warnings.push("déjà saisie dans l’app : la saisie est gardée");
        rows.push({ key: `${f.date}|${zs_id}`, line: f.line, origine: f.origine, date: f.date, zs_id, zs_nom: zsName[zs_id] || zs_id, action, errors, warnings, calcules, record });
        if (!errors.length) prev = { date: f.date, record: ex && ex.source !== "historique" ? ex : record };
        if (action === "nouvelle" || action === "remplace") for (const id of record.nouvelles_as) asLot.set(id, f.date);
      }
    }
    for (const f of invalid) rows.push({ ...f, zs_nom: zsName[f.zs_id] || f.zs_id || "–", record: null });
    rows.sort((a, b) => a.zs_nom + a.date < b.zs_nom + b.date ? -1 : 1);
    const parZs = [...byZs.keys()].map((id) => {
      var _a2, _b;
      const r = rows.filter((x) => x.zs_id === id && x.record);
      return { zs_id: id, zs_nom: zsName[id] || id, du: (_a2 = r[0]) == null ? void 0 : _a2.date, au: (_b = r[r.length - 1]) == null ? void 0 : _b.date, fiches: r.filter((x) => ["nouvelle", "remplace"].includes(x.action)).length, erreurs: r.filter((x) => x.action === "erreur").length };
    }).sort((a, b) => a.zs_nom < b.zs_nom ? -1 : 1);
    const count = (a) => rows.filter((x) => x.action === a).length;
    return { rows, parZs, resume: { nouvelle: count("nouvelle"), remplace: count("remplace"), ignoree: count("ignoree"), erreur: count("erreur") } };
  }
  var recordsToImport = (plan) => plan.rows.filter((r) => ["nouvelle", "remplace"].includes(r.action)).map((r) => r.record);

  // ../drive-backup/src/import-entry.js
  function objets(arrays) {
    if (!arrays.length) return [];
    const head = arrays[0].map((c) => String(c != null ? c : "").trim());
    return arrays.slice(1).map((r) => Object.fromEntries(head.map((h, j) => {
      var _a;
      return [h, (_a = r[j]) != null ? _a : ""];
    })));
  }
  function planifier(classeurs, { zsList, reports, today, areas = [] }) {
    const norm2 = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const modele = [], inv = [], contacts = [], suivi = [], lus = [];
    for (const c of classeurs) {
      const types = [];
      for (const [nom, arrays] of Object.entries(c.onglets)) {
        const n2 = norm2(nom);
        if (n2 === "historique") {
          modele.push(...parseModele(objets(arrays), zsList).map((x) => ({ ...x, source_detail: x.source_detail || c.nom })));
          types.push("modèle historique");
        } else if (n2 === "investigations") {
          const t = tableFrom(arrays, "ID investigation");
          inv.push(...t);
          if (t.length) types.push(`${t.length} investigations`);
        } else if (n2 === "contacts") {
          const t = tableFrom(arrays, "ID contact");
          contacts.push(...t);
          if (t.length) types.push(`${t.length} contacts`);
        } else if (n2 === "suivi quotidien") {
          const t = tableFrom(arrays, "ID contact");
          suivi.push(...t);
          if (t.length) types.push(`${t.length} visites`);
        }
      }
      lus.push({ nom: c.nom, types });
    }
    const d2 = inv.length + contacts.length + suivi.length ? deriveFromDps({ inv, contacts, suivi }, zsList, today) : { fiches: [], notes: null };
    const plan = buildPlan({ modele, dps: d2.fiches }, { reports, zsList, today, areas });
    return { plan, notes: d2.notes, lus, fiches: recordsToImport(plan) };
  }
  return __toCommonJS(import_entry_exports);
})();
