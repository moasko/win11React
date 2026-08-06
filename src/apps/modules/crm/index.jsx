import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { ModuleWindow } from "../../ModuleWindow";
import { Icon } from "../../../utils/general";
import { api } from "../../../api/client";
import { saveAs } from "../../cloud";
import { scrollSectionIntoView } from "../../scrollTo";
import "./crm.scss";

// CRM : fiches clients et opportunités commerciales.
// Mise en page et habillage repris du générateur QR — voir src/apps/README.md.

const SECTIONS = [
  { id: "portefeuille", label: "Portefeuille", icon: "faUsers" },
  { id: "fiche", label: "Fiche client", icon: "faIdCard" },
  { id: "opportunites", label: "Opportunités", icon: "faHandshake" },
  { id: "analytics", label: "Analytics", icon: "faChartColumn" },
];

const STATUSES = [
  { id: "prospect", label: "Prospect" },
  { id: "actif", label: "Client actif" },
  { id: "inactif", label: "Inactif" },
];

const STAGES = [
  { id: "contact", label: "Premier contact" },
  { id: "devis", label: "Devis envoyé" },
  { id: "negociation", label: "Négociation" },
  { id: "gagnee", label: "Gagnée" },
  { id: "perdue", label: "Perdue" },
];

const OPEN_STAGES = ["contact", "devis", "negociation"];

const EMPTY_CLIENT = {
  nom: "",
  entreprise: "",
  email: "",
  telephone: "",
  ville: "",
  statut: "prospect",
  notes: "",
};

const formatMontant = (n) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));

export const manifest = {
  slug: "crm",
  name: "CRM",
  icon: "people",
  action: "CRMAPP",
  Window: CrmApp,
};

function CrmApp() {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);
  const session = useSelector((state) => state.session);

  const [section, setSection] = useState("portefeuille");
  const [clients, setClients] = useState([]);
  const [opportunites, setOpps] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // Brouillon du formulaire : null = rien d'ouvert, sans selectedId = création.
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("tous");
  const [oppDraft, setOppDraft] = useState({ libelle: "", montant: "", etape: "contact" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const mainRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const registerSection = (id) => (el) => {
    sectionRefs.current[id] = el;
  };

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  const load = async () => {
    try {
      const [c, o] = await Promise.all([
        api.records.list(manifest.slug, "clients"),
        api.records.list(manifest.slug, "opportunites"),
      ]);
      setClients(c);
      setOpps(o);
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      const d = c.data;
      if (statusFilter !== "tous" && d.statut !== statusFilter) return false;
      if (!q) return true;
      return [d.nom, d.entreprise, d.email, d.ville]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [clients, query, statusFilter]);

  const selected = clients.find((c) => c.id === selectedId);
  const clientOpps = opportunites.filter((o) => o.data.clientId === selectedId);

  const pipeline = useMemo(
    () =>
      opportunites
        .filter((o) => OPEN_STAGES.includes(o.data.etape))
        .reduce((sum, o) => sum + (Number(o.data.montant) || 0), 0),
    [opportunites],
  );

  const gagne = useMemo(
    () =>
      opportunites
        .filter((o) => o.data.etape === "gagnee")
        .reduce((sum, o) => sum + (Number(o.data.montant) || 0), 0),
    [opportunites],
  );

  const clientPipeline = clientOpps
    .filter((o) => OPEN_STAGES.includes(o.data.etape))
    .reduce((sum, o) => sum + (Number(o.data.montant) || 0), 0);

  const openNew = () => {
    setSelectedId(null);
    setDraft({ ...EMPTY_CLIENT });
    goToSection("fiche");
  };

  const openClient = (client) => {
    setSelectedId(client.id);
    setDraft({ ...EMPTY_CLIENT, ...client.data });
  };

  // Mise à jour fonctionnelle : plusieurs champs peuvent changer avant le
  // rendu suivant (collage, remplissage auto), partir de `draft` capturé
  // écraserait les modifications précédentes.
  const setField = (key) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const saveClient = async () => {
    if (!draft.nom.trim() && !draft.entreprise.trim()) {
      flash("Renseignez au moins un nom ou une entreprise");
      return;
    }
    setBusy(true);
    try {
      if (selectedId) {
        await api.records.update(manifest.slug, "clients", selectedId, draft);
        flash("Fiche mise à jour");
      } else {
        const created = await api.records.create(manifest.slug, "clients", draft);
        setSelectedId(created.id);
        flash("Client créé");
      }
      await load();
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteClient = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Supprimer « ${draft.nom || draft.entreprise} » ?`)) return;
    try {
      // Les opportunités rattachées partent avec la fiche.
      for (const opp of clientOpps) {
        await api.records.remove(manifest.slug, "opportunites", opp.id);
      }
      await api.records.remove(manifest.slug, "clients", selectedId);
      setSelectedId(null);
      setDraft(null);
      await load();
      flash("Fiche supprimée");
    } catch (err) {
      flash(err.message);
    }
  };

  const addOpp = async () => {
    if (!selectedId || !oppDraft.libelle.trim()) return;
    try {
      await api.records.create(manifest.slug, "opportunites", {
        clientId: selectedId,
        libelle: oppDraft.libelle.trim(),
        montant: Number(oppDraft.montant) || 0,
        etape: oppDraft.etape,
      });
      setOppDraft({ libelle: "", montant: "", etape: "contact" });
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  const setOppStage = async (opp, etape) => {
    try {
      await api.records.update(manifest.slug, "opportunites", opp.id, {
        ...opp.data,
        etape,
      });
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  const removeOpp = async (opp) => {
    try {
      await api.records.remove(manifest.slug, "opportunites", opp.id);
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  /// Export CSV — le fichier part dans le cloud, donc l'Explorateur.
  const exportCsv = async () => {
    if (!clients.length || busy) return;
    setBusy(true);
    try {
      const header = ["Nom", "Entreprise", "E-mail", "Téléphone", "Ville", "Statut"];
      const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = clients.map((c) =>
        [
          c.data.nom,
          c.data.entreprise,
          c.data.email,
          c.data.telephone,
          c.data.ville,
          STATUSES.find((s) => s.id === c.data.statut)?.label || c.data.statut,
        ]
          .map(escape)
          .join(";"),
      );
      // BOM UTF-8 pour qu'Excel lise correctement les accents.
      const csv = "﻿" + [header.map(escape).join(";"), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const node = await saveAs(blob, "clients.csv", { folder: manifest.name });
      if (node) flash(`« ${node.name} » enregistré dans l'Explorateur`);
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const counts = {
    total: clients.length,
    prospect: clients.filter((c) => c.data.statut === "prospect").length,
    actif: clients.filter((c) => c.data.statut === "actif").length,
    inactif: clients.filter((c) => c.data.statut === "inactif").length,
  };

  const parEtape = STAGES.map((s) => ({
    ...s,
    count: opportunites.filter((o) => o.data.etape === s.id).length,
    montant: opportunites
      .filter((o) => o.data.etape === s.id)
      .reduce((sum, o) => sum + (Number(o.data.montant) || 0), 0),
  }));

  const maxEtape = Math.max(1, ...parEtape.map((e) => e.montant));

  const initial = (d) =>
    (d?.nom || d?.entreprise || "?").trim().charAt(0).toUpperCase();

  return (
    <ModuleWindow manifest={manifest} className="crmApp">
      {session.status !== "authenticated" ? (
        <div className="crmLocked">Connectez-vous pour accéder au CRM.</div>
      ) : (
        <div className="crmShell">
          {/* Navigation latérale */}
          <aside className="crmNav">
            {SECTIONS.map((s) => (
              <div
                key={s.id}
                className="crmNavItem handcr"
                data-active={section === s.id}
                onClick={() => goToSection(s.id)}
              >
                <Icon fafa={s.icon} width={13} />
                <span>{s.label}</span>
              </div>
            ))}
          </aside>

          {/* Colonne centrale */}
          <div className="crmMain win11Scroll" ref={mainRef}>
            <section ref={registerSection("portefeuille")} className="crmSection">
              <h2>
                <span className="crmNum">1.</span> Portefeuille
              </h2>
              <p className="crmHint">
                Recherchez et filtrez les clients de votre espace de travail
              </p>

              <div className="crmField">
                <input
                  type="text"
                  placeholder="Rechercher par nom, entreprise, e-mail ou ville…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="crmChips">
                <div
                  className="crmChip handcr"
                  data-active={statusFilter === "tous"}
                  onClick={() => setStatusFilter("tous")}
                >
                  Tous ({counts.total})
                </div>
                {STATUSES.map((s) => (
                  <div
                    key={s.id}
                    className="crmChip handcr"
                    data-active={statusFilter === s.id}
                    onClick={() => setStatusFilter(s.id)}
                  >
                    {s.label} ({counts[s.id]})
                  </div>
                ))}
              </div>

              {visible.length === 0 ? (
                <div className="crmEmptyBox">
                  {clients.length === 0
                    ? "Aucun client pour l'instant. Créez la première fiche depuis le panneau de droite."
                    : "Aucun résultat pour ce filtre."}
                </div>
              ) : (
                <div className="crmList">
                  {visible.map((c) => (
                    <div
                      key={c.id}
                      className="crmRow handcr"
                      data-active={c.id === selectedId}
                      onClick={() => openClient(c)}
                    >
                      <div className="crmAvatar" data-statut={c.data.statut}>
                        {initial(c.data)}
                      </div>
                      <div className="crmRowInfo">
                        <div className="crmRowName">
                          {c.data.nom || c.data.entreprise}
                        </div>
                        <div className="crmRowMeta">
                          {[c.data.nom ? c.data.entreprise : null, c.data.ville]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="crmTag" data-statut={c.data.statut}>
                        {STATUSES.find((s) => s.id === c.data.statut)?.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section ref={registerSection("fiche")} className="crmSection">
              <h2>
                <span className="crmNum">2.</span> Fiche client
              </h2>
              <p className="crmHint">
                {draft
                  ? "Coordonnées et suivi du contact"
                  : "Sélectionnez un client dans le portefeuille, ou créez une fiche"}
              </p>

              {!draft ? (
                <div className="crmEmptyBox">Aucune fiche ouverte.</div>
              ) : (
                <>
                  <div className="crmRowGrid">
                    <label className="crmField">
                      <span className="crmLabel">Nom du contact</span>
                      <input type="text" value={draft.nom} onChange={setField("nom")} />
                    </label>
                    <label className="crmField">
                      <span className="crmLabel">Entreprise</span>
                      <input
                        type="text"
                        value={draft.entreprise}
                        onChange={setField("entreprise")}
                      />
                    </label>
                    <label className="crmField">
                      <span className="crmLabel">E-mail</span>
                      <input
                        type="text"
                        value={draft.email}
                        onChange={setField("email")}
                      />
                    </label>
                    <label className="crmField">
                      <span className="crmLabel">Téléphone</span>
                      <input
                        type="text"
                        value={draft.telephone}
                        onChange={setField("telephone")}
                      />
                    </label>
                    <label className="crmField">
                      <span className="crmLabel">Ville</span>
                      <input
                        type="text"
                        value={draft.ville}
                        onChange={setField("ville")}
                      />
                    </label>
                    <label className="crmField">
                      <span className="crmLabel">Statut</span>
                      <select value={draft.statut} onChange={setField("statut")}>
                        {STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="crmField">
                    <span className="crmLabel">Notes</span>
                    <textarea rows={3} value={draft.notes} onChange={setField("notes")} />
                  </label>
                </>
              )}
            </section>

            <section ref={registerSection("opportunites")} className="crmSection">
              <h2>
                <span className="crmNum">3.</span> Opportunités
              </h2>
              <p className="crmHint">
                Affaires en cours pour le client sélectionné
              </p>

              {!selectedId ? (
                <div className="crmEmptyBox">
                  Ouvrez une fiche client pour gérer ses opportunités.
                </div>
              ) : (
                <>
                  {clientOpps.length === 0 ? (
                    <div className="crmEmptyBox">Aucune opportunité enregistrée.</div>
                  ) : (
                    <div className="crmList">
                      {clientOpps.map((opp) => (
                        <div key={opp.id} className="crmOppRow">
                          <div className="crmOppName">{opp.data.libelle}</div>
                          <div className="crmOppAmount">
                            {formatMontant(opp.data.montant)}
                          </div>
                          <select
                            value={opp.data.etape}
                            data-etape={opp.data.etape}
                            onChange={(e) => setOppStage(opp, e.target.value)}
                          >
                            {STAGES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <div
                            className="crmOppDel handcr"
                            onClick={() => removeOpp(opp)}
                          >
                            ✕
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="crmOppNew">
                    <input
                      type="text"
                      placeholder="Libellé de l'affaire"
                      value={oppDraft.libelle}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOppDraft((o) => ({ ...o, libelle: v }));
                      }}
                      onKeyDown={(e) => e.key === "Enter" && addOpp()}
                    />
                    <input
                      type="number"
                      placeholder="Montant"
                      value={oppDraft.montant}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOppDraft((o) => ({ ...o, montant: v }));
                      }}
                      onKeyDown={(e) => e.key === "Enter" && addOpp()}
                    />
                    <select
                      value={oppDraft.etape}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOppDraft((o) => ({ ...o, etape: v }));
                      }}
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="crmBtnGhost handcr" onClick={addOpp}>
                      Ajouter
                    </div>
                  </div>
                </>
              )}
            </section>

            <section ref={registerSection("analytics")} className="crmSection">
              <h2>
                <span className="crmNum">4.</span> Analytics
              </h2>
              <p className="crmHint">Répartition du portefeuille et des affaires</p>

              <div className="crmStatRow">
                <div className="crmStatCard">
                  <div className="crmStatVal">{counts.total}</div>
                  <div className="crmStatLbl">clients</div>
                </div>
                <div className="crmStatCard">
                  <div className="crmStatVal">{formatMontant(pipeline)}</div>
                  <div className="crmStatLbl">pipeline ouvert</div>
                </div>
                <div className="crmStatCard">
                  <div className="crmStatVal">{formatMontant(gagne)}</div>
                  <div className="crmStatLbl">affaires gagnées</div>
                </div>
              </div>

              <div className="crmBars">
                {parEtape.map((e) => (
                  <div key={e.id} className="crmBarRow">
                    <div className="crmBarLabel">{e.label}</div>
                    <div className="crmBarTrack">
                      <div
                        className="crmBarFill"
                        data-etape={e.id}
                        style={{ width: `${(e.montant / maxEtape) * 100}%` }}
                      />
                    </div>
                    <div className="crmBarVal">
                      {e.count} · {formatMontant(e.montant)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Panneau contextuel */}
          <aside className="crmSide win11Scroll">
            <div className="crmSideTitle">
              {draft ? (selectedId ? "Client sélectionné" : "Nouveau client") : "Aperçu"}
            </div>

            <div className="crmCard">
              {draft ? (
                <>
                  <div className="crmBigAvatar" data-statut={draft.statut}>
                    {initial(draft)}
                  </div>
                  <div className="crmCardName">
                    {draft.nom || draft.entreprise || "Sans nom"}
                  </div>
                  <div className="crmCardMeta">
                    {draft.nom && draft.entreprise ? draft.entreprise : draft.ville}
                  </div>
                  <div className="crmTag" data-statut={draft.statut}>
                    {STATUSES.find((s) => s.id === draft.statut)?.label}
                  </div>
                  {selectedId ? (
                    <div className="crmCardStats">
                      <div>
                        <strong>{clientOpps.length}</strong> affaire
                        {clientOpps.length > 1 ? "s" : ""}
                      </div>
                      <div>
                        <strong>{formatMontant(clientPipeline)}</strong> en cours
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="crmCardEmpty">
                  Sélectionnez un client pour voir son résumé.
                </div>
              )}
            </div>

            <div
              className="crmPrimary handcr"
              data-off={!draft || busy}
              onClick={saveClient}
            >
              <Icon fafa="faFloppyDisk" width={12} />
              <span>{busy ? "Enregistrement…" : "Enregistrer la fiche"}</span>
            </div>

            <div className="crmSideBtns">
              <div className="crmSideBtn handcr" onClick={openNew}>
                <Icon fafa="faUserPlus" width={10} />
                <span>Nouveau client</span>
              </div>
              <div
                className="crmSideBtn handcr"
                data-off={!clients.length || busy}
                onClick={exportCsv}
              >
                <Icon fafa="faFileCsv" width={10} />
                <span>Export CSV</span>
              </div>
            </div>

            <div className="crmQuick">
              <div className="crmQuickTitle">Options rapides</div>
              <div className="crmQuickBtns">
                <div
                  className="crmQuickBtn handcr"
                  data-off={!selected?.data.email}
                  onClick={() =>
                    selected?.data.email &&
                    window.open(`mailto:${selected.data.email}`, "_blank")
                  }
                >
                  <Icon fafa="faEnvelope" width={10} />
                  <span>Écrire au client</span>
                </div>
                <div
                  className="crmQuickBtn crmDanger handcr"
                  data-off={!selectedId}
                  onClick={deleteClient}
                >
                  <Icon fafa="faTrash" width={10} />
                  <span>Supprimer la fiche</span>
                </div>
              </div>
            </div>

            {notice ? <div className="crmNotice">{notice}</div> : null}
          </aside>
        </div>
      )}
    </ModuleWindow>
  );
}
