import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { Icon, Image, ToolBar } from "../../../utils/general";
import { api, getToken } from "../../../api/client";
import "./assets/fileexpo.scss";

// L'Explorateur est le poste de pilotage du cloud CompanyOS : même
// habillage que l'explorateur Windows, mais chaque dossier et chaque
// fichier vit dans l'espace de stockage du tenant, servi par l'API.

const formatBytes = (bytes) => {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
};

export const Explorer = () => {
  const wnapp = useSelector((state) => state.apps.explorer);
  const session = useSelector((state) => state.session);
  // Incrémenté dès qu'une app écrit un fichier dans le cloud.
  const cloudVersion = useSelector((state) => state.cloud.version);

  // Fil de navigation : [{id:null, name:"Cloud"}, ...dossiers ouverts]
  const [path, setPath] = useState([{ id: null, name: "Cloud" }]);
  // Historique pour les flèches précédent / suivant.
  const [hist, setHist] = useState([[{ id: null, name: "Cloud" }]]);
  const [hid, setHid] = useState(0);
  const [nodes, setNodes] = useState([]);
  const [rootFolders, setRootFolders] = useState([]);
  const [usage, setUsage] = useState(null);
  const [selected, setSelect] = useState(null);
  const [searchtxt, setShText] = useState("");
  const [view, setView] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const current = path[path.length - 1];

  const refresh = async () => {
    if (session.status !== "authenticated") return;
    try {
      const [list, use] = await Promise.all([
        api.listFiles(current.id),
        api.usage(),
      ]);
      setNodes(list);
      setUsage(use);
      if (current.id == null) setRootFolders(list.filter((n) => n.type === "FOLDER"));
      setError("");
    } catch (err) {
      setError(err.message || "Cloud indisponible");
    }
  };

  useEffect(() => {
    if (!wnapp.hide) refresh();
  }, [wnapp.hide, session.status, current.id, cloudVersion]);

  // Navigation : chaque déplacement alimente l'historique.
  const navigate = (newPath) => {
    const next = [...hist.slice(0, hid + 1), newPath];
    setHist(next);
    setHid(next.length - 1);
    setPath(newPath);
    setSelect(null);
    setShText("");
  };

  const goPrev = () => {
    if (hid > 0) {
      setHid(hid - 1);
      setPath(hist[hid - 1]);
      setSelect(null);
    }
  };

  const goNext = () => {
    if (hid + 1 < hist.length) {
      setHid(hid + 1);
      setPath(hist[hid + 1]);
      setSelect(null);
    }
  };

  const goUp = () => {
    if (path.length > 1) navigate(path.slice(0, -1));
  };

  const openNode = (node) => {
    if (node.type === "FOLDER") {
      navigate([...path, { id: node.id, name: node.name }]);
    } else {
      download(node);
    }
  };

  const download = async (node) => {
    try {
      const res = await fetch(api.downloadUrl(node.id), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Téléchargement impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = node.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const createFolder = async () => {
    const name = window.prompt("Nom du nouveau dossier :");
    if (!name || !name.trim()) return;
    try {
      await api.createFolder(name.trim(), current.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadFile(file, current.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    const node = nodes.find((n) => n.id === selected);
    if (!node) return;
    if (!window.confirm(`Supprimer « ${node.name} » ?`)) return;
    try {
      await api.deleteNode(node.id);
      setSelect(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selected);

  const handleKey = (e) => {
    if (e.key == "Backspace") goPrev();
    if (e.key == "Delete" && selected) removeSelected();
  };

  return (
    <div
      className="msfiles floatTab dpShad"
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
        name="Explorateur — Cloud"
      />
      <div className="windowScreen flex flex-col">
        {/* Ruban : mêmes classes, actions réelles */}
        <div className="msribbon flex">
          <div className="ribsec">
            <div className="drdwcont flex handcr prtclk" onClick={createFolder}>
              <Icon src="new" ui width={18} margin="0 6px" />
              <span>Nouveau dossier</span>
            </div>
            <div
              className="drdwcont flex handcr prtclk"
              onClick={() => fileInput.current?.click()}
            >
              <Icon src="paste" ui width={18} margin="0 6px" />
              <span>{busy ? "Envoi…" : "Importer"}</span>
            </div>
            <input ref={fileInput} type="file" className="none" onChange={upload} />
          </div>
          <div className="ribsec">
            <div
              className="drdwcont flex handcr prtclk"
              data-off={!selectedNode || selectedNode.type !== "FILE"}
              onClick={() => selectedNode?.type === "FILE" && download(selectedNode)}
            >
              <Icon src="copy" ui width={18} margin="0 6px" />
              <span>Télécharger</span>
            </div>
            <div
              className="drdwcont flex handcr prtclk"
              data-off={!selectedNode}
              onClick={removeSelected}
            >
              <Icon src="cut" ui width={18} margin="0 6px" />
              <span>Supprimer</span>
            </div>
          </div>
        </div>
        <div className="restWindow flex-grow flex flex-col">
          <div className="sec1">
            <Icon
              className={"navIcon hvtheme" + (hid == 0 ? " disableIt" : "")}
              fafa="faArrowLeft"
              width={14}
              onClick={goPrev}
              pr
            />
            <Icon
              className={
                "navIcon hvtheme" + (hid + 1 == hist.length ? " disableIt" : "")
              }
              fafa="faArrowRight"
              width={14}
              onClick={goNext}
              pr
            />
            <Icon
              className={"navIcon hvtheme" + (path.length == 1 ? " disableIt" : "")}
              fafa="faArrowUp"
              width={14}
              onClick={goUp}
              pr
            />
            <div className="path-bar noscroll" tabIndex="-1">
              <div className="dirfbox h-full flex">
                {path.map((step, i) => (
                  <div key={step.id || "root"} className="dirCont flex items-center">
                    <div
                      className="dncont"
                      tabIndex="-1"
                      onClick={() => navigate(path.slice(0, i + 1))}
                    >
                      {step.name}
                    </div>
                    <Icon className="dirchev" fafa="faChevronRight" width={8} />
                  </div>
                ))}
              </div>
            </div>
            <div className="srchbar">
              <Icon className="searchIcon" src="search" width={12} />
              <input
                type="text"
                onChange={(e) => setShText(e.target.value)}
                value={searchtxt}
                placeholder="Rechercher"
              />
            </div>
          </div>
          <div className="sec2">
            {/* Volet latéral : accès rapide au cloud du tenant */}
            <div className="navpane win11Scroll">
              <div className="extcont">
                <div className="dropdownmenu">
                  <div className="droptitle">
                    <Icon className="arrUi" fafa="faChevronDown" width={10} />
                    <div
                      className="navtitle flex prtclk"
                      onClick={() => navigate([{ id: null, name: "Cloud" }])}
                    >
                      <Icon className="mr-1" src="win/onedrive-sm" width={16} />
                      <span>{session.tenant?.name || "Cloud"}</span>
                    </div>
                    <Icon className="pinUi" src="win/pinned" width={16} />
                  </div>
                  <div className="dropcontent">
                    {rootFolders.map((folder) => (
                      <div key={folder.id} className="dropdownmenu">
                        <div className="droptitle">
                          <Icon className="arrUi opacity-0" fafa="faCircle" width={10} />
                          <div
                            className="navtitle flex prtclk"
                            onClick={() =>
                              navigate([
                                { id: null, name: "Cloud" },
                                { id: folder.id, name: folder.name },
                              ])
                            }
                          >
                            <Icon className="mr-1" src="win/folder-sm" width={16} />
                            <span>{folder.name}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div
              className="contentarea"
              onClick={() => setSelect(null)}
              onKeyDown={handleKey}
              tabIndex="-1"
            >
              {session.status !== "authenticated" ? (
                <span className="text-xs mx-auto my-4">
                  Connectez-vous pour accéder au cloud.
                </span>
              ) : (
                <div className="contentwrap win11Scroll">
                  {error ? (
                    <span className="text-xs mx-auto my-2" style={{ color: "#e66" }}>
                      {error}
                    </span>
                  ) : null}
                  <div className="gridshow" data-size={view == 1 ? "lg" : "md"}>
                    {nodes.map((node) => {
                      return (
                        node.name
                          .toLowerCase()
                          .includes(searchtxt.toLowerCase()) && (
                          <div
                            key={node.id}
                            className="conticon hvtheme flex flex-col items-center prtclk"
                            data-id={node.id}
                            data-focus={selected == node.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelect(node.id);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              openNode(node);
                            }}
                          >
                            <Image
                              src={`icon/win/${node.type === "FOLDER" ? "folder" : "docs"}`}
                            />
                            <span>{node.name}</span>
                          </div>
                        )
                      );
                    })}
                  </div>
                  {nodes.length == 0 && !error ? (
                    <span className="text-xs mx-auto">Ce dossier est vide.</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className="sec3">
            <div className="item-count text-xs">
              {nodes.length} élément{nodes.length > 1 ? "s" : ""}
              {usage
                ? ` — ${formatBytes(usage.usedBytes)} sur ${formatBytes(usage.quota)}`
                : ""}
            </div>
            <div className="view-opts flex">
              <Icon
                className="viewicon hvtheme p-1"
                onClick={() => setView(5)}
                open={view == 5}
                src="win/viewinfo"
                width={16}
                pr
              />
              <Icon
                className="viewicon hvtheme p-1"
                onClick={() => setView(1)}
                open={view == 1}
                src="win/viewlarge"
                width={16}
                pr
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
