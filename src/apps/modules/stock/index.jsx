import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { ModuleWindow } from "../../ModuleWindow";
import { Icon } from "../../../utils/general";
import { api } from "../../../api/client";
import { saveAs } from "../../cloud";
import { scrollSectionIntoView } from "../../scrollTo";
import "./stock.scss";

// Stock : articles, niveaux et mouvements.
//
// Volontairement en une seule colonne : trois sections courtes, et rien
// à afficher en permanence qui justifierait une barre latérale ou un
// panneau d'aperçu. La charte (jetons de thème, sections numérotées,
// chips, champs) reste celle des autres modules.

const EMPTY_ARTICLE = {
  reference: "",
  designation: "",
  categorie: "",
  unite: "pièce",
  prixAchat: 0,
  prixVente: 0,
  seuil: 5,
};

const UNITES = ["pièce", "kg", "litre", "carton", "mètre", "heure"];

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const money = (n) => `${nf.format(Math.round((Number(n) || 0) * 100) / 100)} XOF`;
const qty = (n) => nf.format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

export const manifest = {
  slug: "stock",
  name: "Stock",
  icon: "excel",
  action: "STOCKAPP",
  Window: StockApp,
};

function StockApp() {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);
  const session = useSelector((state) => state.session);

  const [articles, setArticles] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("tous");
  const [mvt, setMvt] = useState({ sens: "entree", quantite: "", motif: "" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const mainRef = React.useRef(null);
  const ficheRef = React.useRef(null);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3500);
  };

  const load = async () => {
    try {
      const [a, m] = await Promise.all([
        api.records.list(manifest.slug, "articles"),
        api.records.list(manifest.slug, "mouvements"),
      ]);
      setArticles(a);
      setMouvements(m);
    } catch (err) {
      flash(err.message);
    }
  };

  useEffect(() => {
    if (wnapp && !wnapp.hide && session.status === "authenticated") load();
  }, [wnapp?.hide, session.status]);

  /// Le stock d'un article est la somme de ses mouvements : aucune valeur
  /// n'est stockée en double, donc rien ne peut diverger de l'historique.
  const stockOf = useMemo(() => {
    const totals = {};
    for (const m of mouvements) {
      const q = Number(m.data.quantite) || 0;
      totals[m.data.articleId] =
        (totals[m.data.articleId] || 0) + (m.data.sens === "sortie" ? -q : q);
    }
    return totals;
  }, [mouvements]);

  const niveau = (record) => {
    const s = stockOf[record.id] || 0;
    const seuil = Number(record.data.seuil) || 0;
    if (s <= 0) return { id: "rupture", label: "Rupture", tone: "bad" };
    if (s <= seuil) return { id: "alerte", label: "Sous le seuil", tone: "warn" };
    return { id: "ok", label: "En stock", tone: "ok" };
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (filter !== "tous" && niveau(a).id !== filter) return false;
      if (!q) return true;
      return [a.data.reference, a.data.designation, a.data.categorie]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [articles, query, filter, stockOf]);

  const totaux = useMemo(() => {
    let valeur = 0;
    let alerte = 0;
    let rupture = 0;
    articles.forEach((a) => {
      const s = stockOf[a.id] || 0;
      valeur += s * (Number(a.data.prixAchat) || 0);
      const n = niveau(a).id;
      if (n === "alerte") alerte += 1;
      if (n === "rupture") rupture += 1;
    });
    return { valeur, alerte, rupture };
  }, [articles, stockOf]);

  const openNew = () => {
    setSelectedId(null);
    setDraft({ ...EMPTY_ARTICLE });
    scrollSectionIntoView(mainRef.current, ficheRef.current);
  };

  const openArticle = (record) => {
    setSelectedId(record.id);
    setDraft({ ...EMPTY_ARTICLE, ...record.data });
  };

  // Mise à jour fonctionnelle : plusieurs champs peuvent changer avant le
  // rendu suivant, partir de `draft` capturé écraserait les précédents.
  const setField = (key) => (e) => {
    const raw = e.target.value;
    const numeric = ["prixAchat", "prixVente", "seuil"].includes(key);
    const value = numeric ? (raw === "" ? "" : Number(raw)) : raw;
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const saveArticle = async () => {
    if (!draft.designation.trim()) {
      flash("La désignation est obligatoire");
      return;
    }
    const clash = articles.find(
      (a) =>
        a.id !== selectedId &&
        draft.reference.trim() &&
        a.data.reference === draft.reference.trim(),
    );
    if (clash) {
      flash(`La référence ${draft.reference} est déjà utilisée`);
      return;
    }
    setBusy(true);
    try {
      if (selectedId) {
        await api.records.update(manifest.slug, "articles", selectedId, draft);
        flash("Article mis à jour");
      } else {
        const created = await api.records.create(manifest.slug, "articles", draft);
        setSelectedId(created.id);
        flash("Article créé");
      }
      await load();
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteArticle = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Supprimer « ${draft.designation} » et ses mouvements ?`))
      return;
    try {
      for (const m of mouvements.filter((m) => m.data.articleId === selectedId)) {
        await api.records.remove(manifest.slug, "mouvements", m.id);
      }
      await api.records.remove(manifest.slug, "articles", selectedId);
      setSelectedId(null);
      setDraft(null);
      await load();
      flash("Article supprimé");
    } catch (err) {
      flash(err.message);
    }
  };

  const addMouvement = async () => {
    const q = Number(mvt.quantite);
    if (!selectedId || !q || q <= 0) {
      flash("Indiquez une quantité positive");
      return;
    }
    if (mvt.sens === "sortie" && q > (stockOf[selectedId] || 0)) {
      flash(`Stock insuffisant : ${qty(stockOf[selectedId] || 0)} disponible`);
      return;
    }
    try {
      await api.records.create(manifest.slug, "mouvements", {
        articleId: selectedId,
        sens: mvt.sens,
        quantite: q,
        motif: mvt.motif.trim(),
        date: today(),
      });
      setMvt({ sens: "entree", quantite: "", motif: "" });
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  const removeMouvement = async (m) => {
    try {
      await api.records.remove(manifest.slug, "mouvements", m.id);
      await load();
    } catch (err) {
      flash(err.message);
    }
  };

  /// Inventaire au format CSV — le fichier part dans le cloud.
  const exportInventaire = async () => {
    if (!articles.length || busy) return;
    setBusy(true);
    try {
      const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = [
        "Référence",
        "Désignation",
        "Catégorie",
        "Unité",
        "Stock",
        "Seuil",
        "Prix achat",
        "Prix vente",
        "Valeur",
      ];
      const rows = articles.map((a) => {
        const s = stockOf[a.id] || 0;
        return [
          a.data.reference,
          a.data.designation,
          a.data.categorie,
          a.data.unite,
          s,
          a.data.seuil,
          a.data.prixAchat,
          a.data.prixVente,
          s * (Number(a.data.prixAchat) || 0),
        ]
          .map(escape)
          .join(";");
      });
      // BOM UTF-8 pour qu'Excel lise correctement les accents.
      const csv = "﻿" + [header.map(escape).join(";"), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const node = await saveAs(blob, `inventaire-${today()}.csv`, {
        folder: manifest.name,
      });
      if (node) flash(`« ${node.name} » enregistré dans l'Explorateur`);
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  const articleMvts = mouvements
    .filter((m) => m.data.articleId === selectedId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const counts = {
    tous: articles.length,
    ok: articles.filter((a) => niveau(a).id === "ok").length,
    alerte: totaux.alerte,
    rupture: totaux.rupture,
  };

  return (
    <ModuleWindow manifest={manifest} className="stkApp">
      {session.status !== "authenticated" ? (
        <div className="stkLocked">Connectez-vous pour accéder au stock.</div>
      ) : (
        <div className="stkMain win11Scroll" ref={mainRef}>
          <div className="stkStatRow">
            <div className="stkStatCard">
              <div className="stkStatVal">{articles.length}</div>
              <div className="stkStatLbl">articles</div>
            </div>
            <div className="stkStatCard">
              <div className="stkStatVal">{money(totaux.valeur)}</div>
              <div className="stkStatLbl">valeur du stock</div>
            </div>
            <div className="stkStatCard" data-alert={totaux.alerte > 0}>
              <div className="stkStatVal">{totaux.alerte}</div>
              <div className="stkStatLbl">sous le seuil</div>
            </div>
            <div className="stkStatCard" data-danger={totaux.rupture > 0}>
              <div className="stkStatVal">{totaux.rupture}</div>
              <div className="stkStatLbl">en rupture</div>
            </div>
          </div>

          <section className="stkSection">
            <div className="stkSectionHead">
              <div>
                <h2>
                  <span className="stkNum">1.</span> Articles
                </h2>
                <p className="stkHint">Catalogue et niveaux de stock</p>
              </div>
              <div className="stkHeadBtns">
                <div className="stkBtnGhost handcr" onClick={openNew}>
                  Nouvel article
                </div>
                <div
                  className="stkBtnGhost handcr"
                  data-off={!articles.length || busy}
                  onClick={exportInventaire}
                >
                  Export inventaire
                </div>
              </div>
            </div>

            <div className="stkField">
              <input
                type="text"
                placeholder="Rechercher par référence, désignation ou catégorie…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="stkChips">
              {[
                { id: "tous", label: "Tous" },
                { id: "ok", label: "En stock" },
                { id: "alerte", label: "Sous le seuil" },
                { id: "rupture", label: "Rupture" },
              ].map((f) => (
                <div
                  key={f.id}
                  className="stkChip handcr"
                  data-active={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} ({counts[f.id]})
                </div>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="stkEmptyBox">
                {articles.length === 0
                  ? "Aucun article. Créez le premier avec « Nouvel article »."
                  : "Aucun résultat pour ce filtre."}
              </div>
            ) : (
              <div className="stkTable">
                <div className="stkTHead">
                  <div>Référence</div>
                  <div>Désignation</div>
                  <div className="stkRight">Stock</div>
                  <div className="stkRight">Seuil</div>
                  <div className="stkRight">Prix vente</div>
                  <div className="stkRight">Valeur</div>
                  <div>État</div>
                </div>
                {visible.map((a) => {
                  const s = stockOf[a.id] || 0;
                  const n = niveau(a);
                  return (
                    <div
                      key={a.id}
                      className="stkTRow handcr"
                      data-active={a.id === selectedId}
                      onClick={() => openArticle(a)}
                    >
                      <div className="stkRef">{a.data.reference || "—"}</div>
                      <div className="stkDesig">
                        {a.data.designation}
                        {a.data.categorie ? (
                          <span className="stkCat">{a.data.categorie}</span>
                        ) : null}
                      </div>
                      <div className="stkRight stkQty">
                        {qty(s)} <span className="stkUnit">{a.data.unite}</span>
                      </div>
                      <div className="stkRight stkMuted">{qty(a.data.seuil)}</div>
                      <div className="stkRight">{money(a.data.prixVente)}</div>
                      <div className="stkRight">
                        {money(s * (Number(a.data.prixAchat) || 0))}
                      </div>
                      <div>
                        <span className="stkTag" data-tone={n.tone}>
                          {n.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section ref={ficheRef} className="stkSection">
            <h2>
              <span className="stkNum">2.</span> Fiche article
            </h2>
            <p className="stkHint">
              {draft
                ? "Références, prix et seuil d'alerte"
                : "Sélectionnez un article dans le tableau, ou créez-en un"}
            </p>

            {!draft ? (
              <div className="stkEmptyBox">Aucune fiche ouverte.</div>
            ) : (
              <>
                <div className="stkGrid">
                  <label className="stkField">
                    <span className="stkLabel">Référence</span>
                    <input
                      type="text"
                      value={draft.reference}
                      placeholder="ART-001"
                      onChange={setField("reference")}
                    />
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Désignation</span>
                    <input
                      type="text"
                      value={draft.designation}
                      onChange={setField("designation")}
                    />
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Catégorie</span>
                    <input
                      type="text"
                      value={draft.categorie}
                      placeholder="Boissons, Fournitures…"
                      onChange={setField("categorie")}
                    />
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Unité</span>
                    <select value={draft.unite} onChange={setField("unite")}>
                      {UNITES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Prix d'achat</span>
                    <input
                      type="number"
                      value={draft.prixAchat}
                      onChange={setField("prixAchat")}
                    />
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Prix de vente</span>
                    <input
                      type="number"
                      value={draft.prixVente}
                      onChange={setField("prixVente")}
                    />
                  </label>
                  <label className="stkField">
                    <span className="stkLabel">Seuil d'alerte</span>
                    <input
                      type="number"
                      value={draft.seuil}
                      onChange={setField("seuil")}
                    />
                  </label>
                  {selectedId ? (
                    <div className="stkField">
                      <span className="stkLabel">Stock actuel</span>
                      <div className="stkReadonly">
                        {qty(stockOf[selectedId] || 0)} {draft.unite}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="stkFormActions">
                  <div
                    className="stkPrimary handcr"
                    data-off={busy}
                    onClick={saveArticle}
                  >
                    <Icon fafa="faFloppyDisk" width={11} />
                    <span>{busy ? "…" : "Enregistrer l'article"}</span>
                  </div>
                  {selectedId ? (
                    <div className="stkBtnGhost stkDanger handcr" onClick={deleteArticle}>
                      Supprimer
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section className="stkSection">
            <h2>
              <span className="stkNum">3.</span> Mouvements
            </h2>
            <p className="stkHint">
              Entrées et sorties de l'article sélectionné — le stock en est la somme
            </p>

            {!selectedId ? (
              <div className="stkEmptyBox">
                Ouvrez un article pour enregistrer ses mouvements.
              </div>
            ) : (
              <>
                <div className="stkMvtNew">
                  <select
                    value={mvt.sens}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMvt((m) => ({ ...m, sens: v }));
                    }}
                  >
                    <option value="entree">Entrée</option>
                    <option value="sortie">Sortie</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Quantité"
                    value={mvt.quantite}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMvt((m) => ({ ...m, quantite: v }));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && addMouvement()}
                  />
                  <input
                    type="text"
                    placeholder="Motif (livraison, vente, casse…)"
                    value={mvt.motif}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMvt((m) => ({ ...m, motif: v }));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && addMouvement()}
                  />
                  <div className="stkBtnGhost handcr" onClick={addMouvement}>
                    Enregistrer
                  </div>
                </div>

                {articleMvts.length === 0 ? (
                  <div className="stkEmptyBox">Aucun mouvement enregistré.</div>
                ) : (
                  <div className="stkMvtList">
                    {articleMvts.map((m) => (
                      <div key={m.id} className="stkMvtRow">
                        <span className="stkMvtSens" data-sens={m.data.sens}>
                          {m.data.sens === "sortie" ? "−" : "+"}
                          {qty(m.data.quantite)}
                        </span>
                        <span className="stkMvtMotif">{m.data.motif || "—"}</span>
                        <span className="stkMvtDate">{m.data.date}</span>
                        <span
                          className="stkMvtDel handcr"
                          onClick={() => removeMouvement(m)}
                        >
                          ✕
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {notice ? <div className="stkNotice">{notice}</div> : null}
        </div>
      )}
    </ModuleWindow>
  );
}
