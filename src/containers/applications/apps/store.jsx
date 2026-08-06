import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Icon, ToolBar } from "../../../utils/general";
import { api } from "../../../api/client";
import { syncInstalledModules, moduleBySlug } from "../../../apps/sync";
import "./assets/boutique.scss";

/// La Boutique CompanyOS : catalogue servi par l'API, installation par
/// espace de travail. Les modules installés dont le composant n'existe pas
/// encore sont marqués « bientôt disponible ».
export const MicroStore = () => {
  const wnapp = useSelector((state) => state.apps.store);
  const session = useSelector((state) => state.session);

  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState("");
  const [busySlug, setBusySlug] = useState(null);
  const [filter, setFilter] = useState("Tout");

  const load = async () => {
    try {
      setCatalog(await api.catalog());
      setError("");
    } catch (err) {
      setError(err.message || "Catalogue indisponible");
    }
  };

  // Recharge à chaque ouverture de la fenêtre, une fois connecté.
  useEffect(() => {
    if (!wnapp.hide && session.status === "authenticated") load();
  }, [wnapp.hide, session.status]);

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

  const categories = ["Tout", ...new Set(catalog.map((a) => a.category))];
  const visible =
    filter === "Tout" ? catalog : catalog.filter((a) => a.category === filter);

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
            <div className="btqEmpty">
              Connectez-vous pour parcourir la Boutique.
            </div>
          ) : (
            <>
              <div className="btqHead">
                <div className="btqTitle">Boutique</div>
                <div className="btqSub">
                  Modules de gestion pour {session.tenant?.name}
                </div>
                <div className="btqTabs">
                  {categories.map((cat) => (
                    <div
                      key={cat}
                      className="btqTab handcr"
                      data-active={filter === cat}
                      onClick={() => setFilter(cat)}
                    >
                      {cat}
                    </div>
                  ))}
                </div>
              </div>
              {error ? <div className="btqError">{error}</div> : null}
              <div className="btqGrid win11Scroll">
                {visible.map((app) => (
                  <div key={app.slug} className="btqCard ltShad">
                    <div className="btqCardTop">
                      <Icon src={app.icon} width={40} />
                      <div className="btqCardInfo">
                        <div className="btqName">{app.name}</div>
                        <div className="btqCat">{app.category}</div>
                      </div>
                    </div>
                    <div className="btqDesc">{app.description}</div>
                    <div className="btqActions">
                      {app.isCore ? (
                        <div className="btqBadge">Socle</div>
                      ) : (
                        <div
                          className="btqBtn handcr"
                          data-installed={app.installed}
                          onClick={() => toggle(app)}
                        >
                          {busySlug === app.slug
                            ? "…"
                            : app.installed
                              ? "Désinstaller"
                              : "Installer"}
                        </div>
                      )}
                      {app.installed && !app.isCore && !moduleBySlug[app.slug] ? (
                        <div className="btqSoon">module à venir</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
