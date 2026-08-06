import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { ModuleWindow } from "../../ModuleWindow";
import { Icon } from "../../../utils/general";
import { api } from "../../../api/client";
import { saveAs } from "../../cloud";
import { scrollSectionIntoView } from "../../scrollTo";
import { invoiceToPdf } from "./pdf";
import "./facturation.scss";

// Facturation : devis et factures, adossés aux clients du CRM.
// Mise en page et charte reprises du générateur QR — voir src/apps/README.md.

const SECTIONS = [
  { id: "factures", label: "Factures", icon: "faFileInvoice" },
  { id: "facture", label: "Facture", icon: "faPenToSquare" },
  { id: "lignes", label: "Lignes", icon: "faListUl" },
  { id: "analytics", label: "Analytics", icon: "faChartColumn" },
];

const STATUTS = [
  { id: "brouillon", label: "Brouillon", tone: "idle" },
  { id: "envoyee", label: "Envoyée", tone: "info" },
  { id: "payee", label: "Payée", tone: "ok" },
  { id: "annulee", label: "Annulée", tone: "off" },
];

const DEVISES = ["XOF", "EUR", "USD"];

const today = () => new Date().toISOString().slice(0, 10);

const plusDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const EMPTY_LIGNE = { designation: "", qte: 1, pu: 0, tva: 18 };

const emptyFacture = () => ({
  numero: "",
  clientId: "",
  clientNom: "",
  clientEntreprise: "",
  clientEmail: "",
  clientVille: "",
  date: today(),
  echeance: plusDays(30),
  devise: "XOF",
  statut: "brouillon",
  notes: "",
  lignes: [{ ...EMPTY_LIGNE }],
});

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const money = (n, devise = "XOF") => `${nf.format(Math.round((Number(n) || 0) * 100) / 100)} ${devise}`;

/// Totaux d'une facture. La TVA est portée par chaque ligne : un même
/// document peut mélanger des taux (prestation, marchandise, exonéré).
const computeTotals = (lignes = []) => {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const ligneHt = (Number(l.qte) || 0) * (Number(l.pu) || 0);
    ht += ligneHt;
    tva += (ligneHt * (Number(l.tva) || 0)) / 100;
  }
  return { ht, tva, ttc: ht + tva };
};

const isLate = (f) =>
  f.statut !== "payee" &&
  f.statut !== "annulee" &&
  f.echeance &&
  f.echeance < today();

export const manifest = {
  slug: "facturation",
  name: "Facturation",
  icon: "msoffice",
  action: "FACTURATIONAPP",
  Window: FacturationApp,
};

function FacturationApp() {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);
  const session = useSelector((state) => state.session);

  const [section, setSection] = useState("factures");
  const [factures, setFactures] = useState([]);
  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("toutes");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const mainRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const registerSection = (id) => (el) => {
    sectionRefs.current[id] = el;
  };

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3500);
  };

  const load = async () => {
    try {
      // Clients et articles viennent des autres modules : un seul
      // référentiel pour tout l'OS, jamais de saisie en double.
      const [f, c, a] = await Promise.all([
        api.records.list(manifest.slug, "factures"),
        api.records.list("crm", "clients").catch(() => []),
        api.records.list("stock", "articles").catch(() => []),
      ]);
      setFactures(f);
      setClients(c);
      setArticles(a);
    } catch (err) {
      flash(err.message);
    }
  };

  useEffect(() => {
    if (wnapp && !wnapp.hide && session.status === "authenticated") load();
  }, [wnapp?.hide, session.status]);

  const goToSection = (id) => {
    setSection(id);
    scrollSectionIntoView(mainRef.current, sectionRefs.current[id]);
  };

  /// Numérotation continue par année : 2026-001, 2026-002…
  const nextNumero = () => {
    const year = new Date().getFullYear();
    const used = factures
      .map((f) => f.data.numero)
      .filter((n) => n && n.startsWith(`${year}-`))
      .map((n) => parseInt(n.slice(5), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${year}-${String(next).padStart(3, "0")}`;
  };

  const openNew = () => {
    setSelectedId(null);
    setDraft({ ...emptyFacture(), numero: nextNumero() });
    goToSection("facture");
  };

  const openFacture = (record) => {
    setSelectedId(record.id);
    setDraft({ ...emptyFacture(), ...record.data });
  };

  // Mise à jour fonctionnelle : plusieurs champs peuvent changer avant le
  // rendu suivant, partir de `draft` capturé écraserait les précédents.
  const setField = (key) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const pickClient = (e) => {
    const id = e.target.value;
    const client = clients.find((c) => c.id === id);
    setDraft((d) => ({
      ...d,
      clientId: id,
      clientNom: client?.data.nom || "",
      clientEntreprise: client?.data.entreprise || "",
      clientEmail: client?.data.email || "",
      clientVille: client?.data.ville || "",
    }));
  };

  const setLigne = (index, key) => (e) => {
    const raw = e.target.value;
    const value = key === "designation" ? raw : raw === "" ? "" : Number(raw);
    setDraft((d) => ({
      ...d,
      lignes: d.lignes.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    }));
  };

  const addLigne = () =>
    setDraft((d) => ({ ...d, lignes: [...d.lignes, { ...EMPTY_LIGNE }] }));

  /// Reprend un article du Stock : désignation et prix de vente sont
  /// recopiés dans la ligne, plus de ressaisie ni d'écart de tarif.
  const pickArticle = (index) => (e) => {
    const id = e.target.value;
    if (!id) return;
    const article = articles.find((a) => a.id === id);
    if (!article) return;
    setDraft((d) => ({
      ...d,
      lignes: d.lignes.map((l, i) =>
        i === index
          ? {
              ...l,
              articleId: id,
              designation: article.data.designation,
              pu: Number(article.data.prixVente) || 0,
            }
          : l,
      ),
    }));
  };

  const removeLigne = (index) =>
    setDraft((d) => ({
      ...d,
      lignes: d.lignes.length > 1 ? d.lignes.filter((_, i) => i !== index) : d.lignes,
    }));

  const totals = useMemo(() => computeTotals(draft?.lignes), [draft?.lignes]);

  const saveFacture = async () => {
    if (!draft.clientId) {
      flash("Choisissez un client");
      goToSection("facture");
      return;
    }
    if (!draft.lignes.some((l) => l.designation.trim())) {
      flash("Ajoutez au moins une ligne");
      goToSection("lignes");
      return;
    }
    // Deux brouillons ouverts en même temps reçoivent le même numéro :
    // on refuse le doublon plutôt que de laisser deux factures homonymes
    // partir en comptabilité.
    const duplicate = factures.find(
      (f) => f.id !== selectedId && f.data.numero === draft.numero.trim(),
    );
    if (duplicate) {
      flash(`Le numéro ${draft.numero} est déjà utilisé — essayez ${nextNumero()}`);
      goToSection("facture");
      return;
    }
    setBusy(true);
    try {
      if (selectedId) {
        await api.records.update(manifest.slug, "factures", selectedId, draft);
        flash(`Facture ${draft.numero} mise à jour`);
      } else {
        const created = await api.records.create(manifest.slug, "factures", draft);
        setSelectedId(created.id);
        flash(`Facture ${draft.numero} créée`);
      }
      await load();
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteFacture = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Supprimer la facture ${draft.numero} ?`)) return;
    try {
      await api.records.remove(manifest.slug, "factures", selectedId);
      setSelectedId(null);
      setDraft(null);
      await load();
      flash("Facture supprimée");
    } catch (err) {
      flash(err.message);
    }
  };

  const markPaid = async () => {
    if (!selectedId) return;
    const updated = { ...draft, statut: "payee" };
    setDraft(updated);
    try {
      await api.records.update(manifest.slug, "factures", selectedId, updated);
      await load();
      flash("Facture marquée payée");
    } catch (err) {
      flash(err.message);
    }
  };

  /// Le PDF part dans le cloud : l'utilisateur choisit son emplacement.
  const exportPdf = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const blob = invoiceToPdf({
        facture: draft,
        totaux: computeTotals(draft.lignes),
        emetteur: { nom: session.tenant?.name || "CompanyOS" },
        statutLabel:
          STATUTS.find((s) => s.id === draft.statut)?.label || draft.statut,
      });
      const node = await saveAs(blob, `facture-${draft.numero}.pdf`, {
        folder: manifest.name,
      });
      if (node) flash(`« ${node.name} » enregistré dans l'Explorateur`);
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return factures.filter((f) => {
      const d = f.data;
      if (filter === "retard" && !isLate(d)) return false;
      if (filter !== "toutes" && filter !== "retard" && d.statut !== filter) return false;
      if (!q) return true;
      return [d.numero, d.clientNom, d.clientEntreprise]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [factures, query, filter]);

  const totauxGlobaux = useMemo(() => {
    let facture = 0;
    let encaisse = 0;
    let attente = 0;
    let retard = 0;
    factures.forEach((f) => {
      const { ttc } = computeTotals(f.data.lignes);
      if (f.data.statut === "annulee") return;
      facture += ttc;
      if (f.data.statut === "payee") encaisse += ttc;
      else {
        attente += ttc;
        if (isLate(f.data)) retard += ttc;
      }
    });
    return { facture, encaisse, attente, retard };
  }, [factures]);

  const parStatut = STATUTS.map((s) => {
    const list = factures.filter((f) => f.data.statut === s.id);
    return {
      ...s,
      count: list.length,
      montant: list.reduce((sum, f) => sum + computeTotals(f.data.lignes).ttc, 0),
    };
  });
  const maxStatut = Math.max(1, ...parStatut.map((s) => s.montant));

  const statusOf = (d) => {
    if (isLate(d)) return { label: "En retard", tone: "late" };
    return STATUTS.find((s) => s.id === d.statut) || STATUTS[0];
  };

  const devise = draft?.devise || "XOF";

  return (
    <ModuleWindow manifest={manifest} className="factApp">
      {session.status !== "authenticated" ? (
        <div className="fctLocked">Connectez-vous pour accéder à la facturation.</div>
      ) : (
        <div className="fctShell">
          {/* Navigation latérale */}
          <aside className="fctNav">
            {SECTIONS.map((s) => (
              <div
                key={s.id}
                className="fctNavItem handcr"
                data-active={section === s.id}
                onClick={() => goToSection(s.id)}
              >
                <Icon fafa={s.icon} width={13} />
                <span>{s.label}</span>
              </div>
            ))}
          </aside>

          {/* Colonne centrale */}
          <div className="fctMain win11Scroll" ref={mainRef}>
            <section ref={registerSection("factures")} className="fctSection">
              <h2>
                <span className="fctNum">1.</span> Factures
              </h2>
              <p className="fctHint">
                Documents émis par {session.tenant?.name}
              </p>

              <div className="fctField">
                <input
                  type="text"
                  placeholder="Rechercher par numéro ou client…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="fctChips">
                <div
                  className="fctChip handcr"
                  data-active={filter === "toutes"}
                  onClick={() => setFilter("toutes")}
                >
                  Toutes ({factures.length})
                </div>
                {STATUTS.map((s) => (
                  <div
                    key={s.id}
                    className="fctChip handcr"
                    data-active={filter === s.id}
                    onClick={() => setFilter(s.id)}
                  >
                    {s.label} ({factures.filter((f) => f.data.statut === s.id).length})
                  </div>
                ))}
                <div
                  className="fctChip handcr"
                  data-active={filter === "retard"}
                  onClick={() => setFilter("retard")}
                >
                  En retard ({factures.filter((f) => isLate(f.data)).length})
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="fctEmptyBox">
                  {factures.length === 0
                    ? "Aucune facture. Créez la première depuis le panneau de droite."
                    : "Aucun résultat pour ce filtre."}
                </div>
              ) : (
                <div className="fctList">
                  {visible.map((f) => {
                    const status = statusOf(f.data);
                    const { ttc } = computeTotals(f.data.lignes);
                    return (
                      <div
                        key={f.id}
                        className="fctRow handcr"
                        data-active={f.id === selectedId}
                        onClick={() => openFacture(f)}
                      >
                        <div className="fctRowNum">{f.data.numero}</div>
                        <div className="fctRowInfo">
                          <div className="fctRowName">
                            {f.data.clientEntreprise || f.data.clientNom || "—"}
                          </div>
                          <div className="fctRowMeta">
                            Échéance {f.data.echeance || "—"}
                          </div>
                        </div>
                        <div className="fctRowTotal">{money(ttc, f.data.devise)}</div>
                        <div className="fctTag" data-tone={status.tone}>
                          {status.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section ref={registerSection("facture")} className="fctSection">
              <h2>
                <span className="fctNum">2.</span> Facture
              </h2>
              <p className="fctHint">
                {draft
                  ? "Client, dates et conditions du document"
                  : "Sélectionnez une facture, ou créez-en une"}
              </p>

              {!draft ? (
                <div className="fctEmptyBox">Aucune facture ouverte.</div>
              ) : (
                <>
                  <div className="fctGrid">
                    <label className="fctField">
                      <span className="fctLabel">Numéro</span>
                      <input
                        type="text"
                        value={draft.numero}
                        onChange={setField("numero")}
                      />
                    </label>
                    <label className="fctField">
                      <span className="fctLabel">Client (depuis le CRM)</span>
                      <select value={draft.clientId} onChange={pickClient}>
                        <option value="">— Choisir un client —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.data.entreprise || c.data.nom}
                            {c.data.entreprise && c.data.nom ? ` — ${c.data.nom}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fctField">
                      <span className="fctLabel">Date d'émission</span>
                      <input type="date" value={draft.date} onChange={setField("date")} />
                    </label>
                    <label className="fctField">
                      <span className="fctLabel">Échéance</span>
                      <input
                        type="date"
                        value={draft.echeance}
                        onChange={setField("echeance")}
                      />
                    </label>
                    <label className="fctField">
                      <span className="fctLabel">Devise</span>
                      <select value={draft.devise} onChange={setField("devise")}>
                        {DEVISES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fctField">
                      <span className="fctLabel">Statut</span>
                      <select value={draft.statut} onChange={setField("statut")}>
                        {STATUTS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {clients.length === 0 ? (
                    <div className="fctWarn">
                      Aucun client dans le CRM. Créez-y une fiche : la facturation
                      s'appuie sur le même référentiel.
                    </div>
                  ) : null}

                  <label className="fctField">
                    <span className="fctLabel">Notes / conditions de règlement</span>
                    <textarea rows={2} value={draft.notes} onChange={setField("notes")} />
                  </label>
                </>
              )}
            </section>

            <section ref={registerSection("lignes")} className="fctSection">
              <h2>
                <span className="fctNum">3.</span> Lignes
              </h2>
              <p className="fctHint">Prestations et marchandises facturées</p>

              {!draft ? (
                <div className="fctEmptyBox">Ouvrez une facture pour saisir ses lignes.</div>
              ) : (
                <>
                  <div className="fctTable">
                    <div className="fctTHead">
                      <div>Désignation</div>
                      <div className="fctRight">Qté</div>
                      <div className="fctRight">Prix unit.</div>
                      <div className="fctRight">TVA %</div>
                      <div className="fctRight">Total HT</div>
                      <div />
                    </div>
                    {draft.lignes.map((l, i) => (
                      <div key={i} className="fctTRow">
                        <div className="fctDesigCell">
                          <input
                            type="text"
                            placeholder="Désignation"
                            value={l.designation}
                            onChange={setLigne(i, "designation")}
                          />
                          {articles.length ? (
                            <select
                              className="fctArticlePick"
                              value=""
                              onChange={pickArticle(i)}
                              title="Reprendre un article du Stock"
                            >
                              <option value="">Article…</option>
                              {articles.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.data.reference
                                    ? `${a.data.reference} — ${a.data.designation}`
                                    : a.data.designation}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                        <input
                          type="number"
                          className="fctRight"
                          value={l.qte}
                          onChange={setLigne(i, "qte")}
                        />
                        <input
                          type="number"
                          className="fctRight"
                          value={l.pu}
                          onChange={setLigne(i, "pu")}
                        />
                        <input
                          type="number"
                          className="fctRight"
                          value={l.tva}
                          onChange={setLigne(i, "tva")}
                        />
                        <div className="fctCell fctRight">
                          {money((Number(l.qte) || 0) * (Number(l.pu) || 0), devise)}
                        </div>
                        <div className="fctDel handcr" onClick={() => removeLigne(i)}>
                          ✕
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="fctLignesFoot">
                    <div className="fctBtnGhost handcr" onClick={addLigne}>
                      Ajouter une ligne
                    </div>
                    <div className="fctTotals">
                      <div>
                        <span>Total HT</span>
                        <strong>{money(totals.ht, devise)}</strong>
                      </div>
                      <div>
                        <span>TVA</span>
                        <strong>{money(totals.tva, devise)}</strong>
                      </div>
                      <div className="fctTtc">
                        <span>Total TTC</span>
                        <strong>{money(totals.ttc, devise)}</strong>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section ref={registerSection("analytics")} className="fctSection">
              <h2>
                <span className="fctNum">4.</span> Analytics
              </h2>
              <p className="fctHint">Chiffre d'affaires et encours</p>

              <div className="fctStatRow">
                <div className="fctStatCard">
                  <div className="fctStatVal">{money(totauxGlobaux.facture)}</div>
                  <div className="fctStatLbl">facturé</div>
                </div>
                <div className="fctStatCard">
                  <div className="fctStatVal">{money(totauxGlobaux.encaisse)}</div>
                  <div className="fctStatLbl">encaissé</div>
                </div>
                <div className="fctStatCard">
                  <div className="fctStatVal">{money(totauxGlobaux.attente)}</div>
                  <div className="fctStatLbl">en attente</div>
                </div>
                <div className="fctStatCard" data-alert={totauxGlobaux.retard > 0}>
                  <div className="fctStatVal">{money(totauxGlobaux.retard)}</div>
                  <div className="fctStatLbl">en retard</div>
                </div>
              </div>

              <div className="fctBars">
                {parStatut.map((s) => (
                  <div key={s.id} className="fctBarRow">
                    <div className="fctBarLabel">{s.label}</div>
                    <div className="fctBarTrack">
                      <div
                        className="fctBarFill"
                        data-tone={s.tone}
                        style={{ width: `${(s.montant / maxStatut) * 100}%` }}
                      />
                    </div>
                    <div className="fctBarVal">
                      {s.count} · {money(s.montant)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Panneau contextuel */}
          <aside className="fctSide win11Scroll">
            <div className="fctSideTitle">
              {draft ? (selectedId ? "Facture ouverte" : "Nouvelle facture") : "Aperçu"}
            </div>

            <div className="fctCard">
              {draft ? (
                <>
                  <div className="fctCardNum">{draft.numero || "—"}</div>
                  <div className="fctCardClient">
                    {draft.clientEntreprise || draft.clientNom || "Client à choisir"}
                  </div>
                  <div className="fctTag" data-tone={statusOf(draft).tone}>
                    {statusOf(draft).label}
                  </div>
                  <div className="fctCardTtc">{money(totals.ttc, devise)}</div>
                  <div className="fctCardMeta">
                    {draft.lignes.length} ligne{draft.lignes.length > 1 ? "s" : ""} ·
                    échéance {draft.echeance || "—"}
                  </div>
                </>
              ) : (
                <div className="fctCardEmpty">
                  Sélectionnez une facture pour voir son résumé.
                </div>
              )}
            </div>

            <div
              className="fctPrimary handcr"
              data-off={!draft || busy}
              onClick={saveFacture}
            >
              <Icon fafa="faFloppyDisk" width={12} />
              <span>{busy ? "…" : "Enregistrer la facture"}</span>
            </div>

            <div className="fctSideBtns">
              <div className="fctSideBtn handcr" onClick={openNew}>
                <Icon fafa="faFileCirclePlus" width={10} />
                <span>Nouvelle</span>
              </div>
              <div
                className="fctSideBtn handcr"
                data-off={!draft || busy}
                onClick={exportPdf}
              >
                <Icon fafa="faFilePdf" width={10} />
                <span>Export PDF</span>
              </div>
            </div>

            <div className="fctQuick">
              <div className="fctQuickTitle">Options rapides</div>
              <div className="fctQuickBtns">
                <div
                  className="fctQuickBtn handcr"
                  data-off={!selectedId || draft?.statut === "payee"}
                  onClick={markPaid}
                >
                  <Icon fafa="faCircleCheck" width={10} />
                  <span>Marquer payée</span>
                </div>
                <div
                  className="fctQuickBtn handcr"
                  data-off={!draft?.clientEmail}
                  onClick={() =>
                    window.open(
                      `mailto:${draft.clientEmail}?subject=${encodeURIComponent(
                        `Facture ${draft.numero}`,
                      )}`,
                      "_blank",
                    )
                  }
                >
                  <Icon fafa="faEnvelope" width={10} />
                  <span>Envoyer au client</span>
                </div>
                <div
                  className="fctQuickBtn fctDanger handcr"
                  data-off={!selectedId}
                  onClick={deleteFacture}
                >
                  <Icon fafa="faTrash" width={10} />
                  <span>Supprimer</span>
                </div>
              </div>
            </div>

            {notice ? <div className="fctNotice">{notice}</div> : null}
          </aside>
        </div>
      )}
    </ModuleWindow>
  );
}
