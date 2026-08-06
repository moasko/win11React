import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Icon, ToolBar } from "../../../utils/general";
import { api } from "../../../api/client";
import { syncInstalledModules, moduleBySlug } from "../../../apps/sync";
import { scrollSectionIntoView } from "../../../apps/scrollTo";
import "./assets/boutique.scss";

// Boutique CompanyOS : catalogue servi par l'API, installation par espace
// de travail. Même charte que les modules — voir src/apps/README.md.

const SECTIONS = [
  { id: "catalogue", label: "Catalogue", icon: "faGrip" },
  { id: "installees", label: "Installées", icon: "faCircleCheck" },
  { id: "apropos", label: "À propos", icon: "faCircleInfo" },
];

export const MicroStore = () => {
  const wnapp = useSelector((state) => state.apps.store);
  const session = useSelector((state) => state.session);

  const [section, setSection] = useState("catalogue");
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tout");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busySlug, setBusySlug] = useState(null);

  const mainRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const registerSection = (id) => (el) => {
    sectionRefs.current[id] = el;
  };

  const load = async () => {
    try {
      setCatalog(await api.catalog());
      setError("");
    } catch (err) {
      setError(err.message || "Catalogue indisponible");
    }
  };

  useEffect(() => {
    if (!wnapp.hide && session.status === "authenticated") load();
  }, [wnapp.hide, session.status]);

  const goToSection = (id) => {
    setSection(id);
    scrollSectionIntoView(mainRef.current, sectionRefs.current[id]);
  };

  const toggle = async (app) => {
    if (busySlug || app.isCore) return;
    setBusySlug(app.slug);
    try {
      if (app.installed) await api.uninstallApp(app.slug);
      else await api.installApp(app.slug);
      // Le shell suit immédiatement : icône ajoutée ou retirée du bureau.
      await syncInstalledModules();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusySlug(null);
    }
  };

  const categories = useMemo(
    () => ["Tout", ...new Set(catalog.map((a) => a.category))],
    [catalog],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((a) => {
      if (filter !== "Tout" && a.category !== filter) return false;
      if (!q) return true;
      return (a.name + " " + a.description).toLowerCase().includes(q);
    });
  }, [catalog, filter, query]);

  const installed = catalog.filter((a) => a.installed);
  const optional = catalog.filter((a) => !a.isCore);
  const detail = catalog.find((a) => a.slug === selected) || null;

  const statusOf = (app) => {
    if (app.isCore) return { label: "Socle", tone: "core" };
    if (!app.installed) return { label: "Disponible", tone: "idle" };
    return moduleBySlug[app.slug]
      ? { label: "Installée", tone: "ok" }
      : { label: "Module à venir", tone: "soon" };
  };

  return (
    <div
      className="boutique floatTab dpShad"
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="Boutique"
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <div className="restWindow flex-grow flex flex-col">
          {session.status !== "authenticated" ? (
            <div className="btqLocked">
              Connectez-vous pour parcourir la Boutique.
            </div>
          ) : (
            <div className="btqShell">
              {/* Navigation latérale */}
              <aside className="btqNav">
                {SECTIONS.map((s) => (
                  <div
                    key={s.id}
                    className="btqNavItem handcr"
                    data-active={section === s.id}
                    onClick={() => goToSection(s.id)}
                  >
                    <Icon fafa={s.icon} width={13} />
                    <span>{s.label}</span>
                  </div>
                ))}
              </aside>

              {/* Colonne centrale */}
              <div className="btqMain win11Scroll" ref={mainRef}>
                <section ref={registerSection("catalogue")} className="btqSection">
                  <h2>
                    <span className="btqNum">1.</span> Catalogue
                  </h2>
                  <p className="btqHint">
                    Modules de gestion disponibles pour {session.tenant?.name}
                  </p>

                  <div className="btqField">
                    <input
                      type="text"
                      placeholder="Rechercher un module…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>

                  <div className="btqChips">
                    {categories.map((cat) => (
                      <div
                        key={cat}
                        className="btqChip handcr"
                        data-active={filter === cat}
                        onClick={() => setFilter(cat)}
                      >
                        {cat}
                      </div>
                    ))}
                  </div>

                  {error ? <div className="btqWarn">{error}</div> : null}

                  {visible.length === 0 ? (
                    <div className="btqEmptyBox">Aucun module pour ce filtre.</div>
                  ) : (
                    <div className="btqGrid">
                      {visible.map((app) => {
                        const status = statusOf(app);
                        return (
                          <div
                            key={app.slug}
                            className="btqCard handcr"
                            data-active={selected === app.slug}
                            onClick={() => setSelected(app.slug)}
                          >
                            <div className="btqCardTop">
                              <Icon src={app.icon} width={34} />
                              <div className="btqCardHead">
                                <div className="btqName">{app.name}</div>
                                <div className="btqCat">{app.category}</div>
                              </div>
                            </div>
                            <div className="btqDesc">{app.description}</div>
                            <div className="btqCardFoot">
                              <div className="btqTag" data-tone={status.tone}>
                                {status.label}
                              </div>
                              {app.isCore ? null : (
                                <div
                                  className="btqAction handcr"
                                  data-installed={app.installed}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggle(app);
                                  }}
                                >
                                  {busySlug === app.slug
                                    ? "…"
                                    : app.installed
                                      ? "Désinstaller"
                                      : "Installer"}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section ref={registerSection("installees")} className="btqSection">
                  <h2>
                    <span className="btqNum">2.</span> Installées
                  </h2>
                  <p className="btqHint">
                    Modules actifs dans cet espace de travail
                  </p>

                  <div className="btqList">
                    {installed.map((app) => {
                      const status = statusOf(app);
                      return (
                        <div key={app.slug} className="btqRow">
                          <Icon src={app.icon} width={22} />
                          <div className="btqRowInfo">
                            <div className="btqRowName">{app.name}</div>
                            <div className="btqRowMeta">
                              {app.category} · v{app.version}
                            </div>
                          </div>
                          <div className="btqTag" data-tone={status.tone}>
                            {status.label}
                          </div>
                          {app.isCore ? null : (
                            <div
                              className="btqAction handcr"
                              data-installed
                              onClick={() => toggle(app)}
                            >
                              Retirer
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section ref={registerSection("apropos")} className="btqSection">
                  <h2>
                    <span className="btqNum">3.</span> À propos
                  </h2>
                  <p className="btqHint">
                    Comment fonctionnent les modules de CompanyOS
                  </p>
                  <div className="btqAbout">
                    <p>
                      Un module installé apparaît immédiatement sur le bureau et
                      dans le menu Démarrer de tout l'espace de travail. Un module
                      retiré disparaît de la même manière — ses données restent
                      conservées et reviennent à la réinstallation.
                    </p>
                    <p>
                      Les modules marqués « Module à venir » sont déjà réservés au
                      catalogue mais leur interface reste à livrer.
                    </p>
                  </div>
                </section>
              </div>

              {/* Panneau contextuel */}
              <aside className="btqSide win11Scroll">
                <div className="btqSideTitle">
                  {detail ? "Module sélectionné" : "Votre espace"}
                </div>

                <div className="btqCardDetail">
                  {detail ? (
                    <>
                      <Icon src={detail.icon} width={48} />
                      <div className="btqDetailName">{detail.name}</div>
                      <div className="btqDetailCat">
                        {detail.category} · v{detail.version}
                      </div>
                      <div className="btqTag" data-tone={statusOf(detail).tone}>
                        {statusOf(detail).label}
                      </div>
                      <div className="btqDetailDesc">{detail.description}</div>
                    </>
                  ) : (
                    <div className="btqDetailEmpty">
                      Sélectionnez un module pour voir sa fiche.
                    </div>
                  )}
                </div>

                {detail && !detail.isCore ? (
                  <div
                    className="btqPrimary handcr"
                    data-off={busySlug === detail.slug}
                    data-installed={detail.installed}
                    onClick={() => toggle(detail)}
                  >
                    <Icon
                      fafa={detail.installed ? "faTrash" : "faDownload"}
                      width={12}
                    />
                    <span>
                      {busySlug === detail.slug
                        ? "…"
                        : detail.installed
                          ? "Désinstaller"
                          : "Installer le module"}
                    </span>
                  </div>
                ) : null}

                <div className="btqStats">
                  <div className="btqStat">
                    <div className="btqStatVal">{catalog.length}</div>
                    <div className="btqStatLbl">au catalogue</div>
                  </div>
                  <div className="btqStat">
                    <div className="btqStatVal">{installed.length}</div>
                    <div className="btqStatLbl">installés</div>
                  </div>
                  <div className="btqStat">
                    <div className="btqStatVal">
                      {optional.filter((a) => !a.installed).length}
                    </div>
                    <div className="btqStatLbl">à découvrir</div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
