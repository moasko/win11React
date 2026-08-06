import React from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../utils/general";

/// Chrome de fenêtre commun à tous les modules CompanyOS.
/// Un module n'a qu'à écrire son contenu :
///
///   <ModuleWindow manifest={manifest} className="monApp">
///     ...contenu...
///   </ModuleWindow>
///
/// La fenêtre (déplacement, réduire/agrandir/fermer, z-index) est gérée ici.
export const ModuleWindow = ({ manifest, className = "", children }) => {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);

  // Module non installé : l'état n'existe pas, la fenêtre non plus.
  if (!wnapp) return null;

  return (
    <div
      className={`${className} moduleWin floatTab dpShad`}
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
        name={manifest.name}
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <div className="restWindow flex-grow flex flex-col">{children}</div>
      </div>
    </div>
  );
};
