import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import QRCode from "qrcode";
import { ModuleWindow } from "../../ModuleWindow";
import { api } from "../../../api/client";
import { saveToCloud, dataUrlToBlob } from "../../cloud";
import "./qrcode.scss";

// ---------------------------------------------------------------------------
// Types de contenu : chaque type déclare ses champs et sait fabriquer la
// chaîne encodée dans le QR. En ajouter un = une entrée dans ce tableau.
// ---------------------------------------------------------------------------

const TYPES = [
  {
    id: "url",
    label: "Lien / Texte",
    fields: [{ key: "text", label: "URL ou texte", placeholder: "https://exemple.com" }],
    build: (v) => v.text || "",
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    fields: [
      { key: "ssid", label: "Nom du réseau (SSID)", placeholder: "MonReseau" },
      { key: "password", label: "Mot de passe", placeholder: "••••••••" },
      {
        key: "security",
        label: "Sécurité",
        select: ["WPA", "WEP", "nopass"],
        labels: { WPA: "WPA / WPA2", WEP: "WEP", nopass: "Réseau ouvert" },
      },
    ],
    build: (v) => {
      const esc = (s = "") => s.replace(/([\\;,:"])/g, "\\$1");
      return `WIFI:T:${v.security || "WPA"};S:${esc(v.ssid)};P:${esc(v.password)};;`;
    },
  },
  {
    id: "vcard",
    label: "Carte de visite",
    fields: [
      { key: "name", label: "Nom complet", placeholder: "Awa Koné" },
      { key: "org", label: "Entreprise", placeholder: "Ma Petite Entreprise" },
      { key: "title", label: "Fonction", placeholder: "Directrice" },
      { key: "phone", label: "Téléphone", placeholder: "+225 07 00 00 00 00" },
      { key: "email", label: "E-mail", placeholder: "awa@entreprise.com" },
      { key: "website", label: "Site web", placeholder: "https://entreprise.com" },
    ],
    build: (v) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${v.name || ""}`,
        v.org ? `ORG:${v.org}` : null,
        v.title ? `TITLE:${v.title}` : null,
        v.phone ? `TEL;TYPE=CELL:${v.phone}` : null,
        v.email ? `EMAIL:${v.email}` : null,
        v.website ? `URL:${v.website}` : null,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    id: "email",
    label: "E-mail",
    fields: [
      { key: "to", label: "Destinataire", placeholder: "contact@entreprise.com" },
      { key: "subject", label: "Objet", placeholder: "Demande de devis" },
      { key: "body", label: "Message", placeholder: "Bonjour…", textarea: true },
    ],
    build: (v) => {
      const params = new URLSearchParams();
      if (v.subject) params.set("subject", v.subject);
      if (v.body) params.set("body", v.body);
      const query = params.toString();
      return `mailto:${v.to || ""}${query ? "?" + query : ""}`;
    },
  },
  {
    id: "sms",
    label: "SMS",
    fields: [
      { key: "phone", label: "Numéro", placeholder: "+225 07 00 00 00 00" },
      { key: "message", label: "Message", placeholder: "Bonjour…", textarea: true },
    ],
    build: (v) => `SMSTO:${v.phone || ""}:${v.message || ""}`,
  },
  {
    id: "tel",
    label: "Appel",
    fields: [{ key: "phone", label: "Numéro", placeholder: "+225 07 00 00 00 00" }],
    build: (v) => `tel:${v.phone || ""}`,
  },
];

const DEFAULT_OPTIONS = {
  size: 320,
  margin: 2,
  level: "M",
  dark: "#000000",
  light: "#ffffff",
  transparent: false,
};

export const manifest = {
  slug: "qrcode",
  name: "Générateur QR",
  icon: "code",
  action: "QRCODEAPP",
  Window: QrApp,
};

function QrApp() {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);
  const session = useSelector((state) => state.session);

  const [typeId, setTypeId] = useState("url");
  const [values, setValues] = useState({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [dataUrl, setDataUrl] = useState("");
  const [saveName, setSaveName] = useState("");
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const type = TYPES.find((t) => t.id === typeId);
  const payload = useMemo(() => type.build(values), [type, values]);

  // Rendu du QR à chaque changement de contenu ou d'option.
  useEffect(() => {
    if (!payload.trim()) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(payload, {
      width: options.size,
      margin: options.margin,
      errorCorrectionLevel: options.level,
      color: {
        dark: options.dark,
        light: options.transparent ? "#0000" : options.light,
      },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [payload, options]);

  const loadHistory = async () => {
    try {
      setHistory(await api.records.list("qrcode", "history"));
    } catch {
      /* hors connexion : pas d'historique */
    }
  };

  useEffect(() => {
    if (wnapp && !wnapp.hide && session.status === "authenticated") loadHistory();
  }, [wnapp?.hide, session.status]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  const setValue = (key) => (e) => setValues({ ...values, [key]: e.target.value });
  const setOption = (key, cast = (x) => x) => (e) =>
    setOptions({ ...options, [key]: cast(e.target.value) });

  /// Le PNG part dans le cloud de l'espace de travail : il apparaît
  /// aussitôt dans l'Explorateur, comme tout fichier produit par l'OS.
  const saveImage = async () => {
    if (!dataUrl || busy) return;
    setBusy(true);
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const base = (saveName.trim() || `qr-${typeId}`).replace(/[\\/:*?"<>|]/g, "-");
      const node = await saveToCloud(blob, `${base}.png`, { folder: manifest.name });
      flash(`« ${node.name} » enregistré dans ${manifest.name}`);
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy(false);
    }
  };

  /// Téléchargement local, en complément — jamais à la place du cloud.
  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${saveName.trim() || `qr-${typeId}`}.png`;
    a.click();
  };

  const copyImage = async () => {
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Image copiée dans le presse-papiers");
    } catch {
      flash("Copie impossible dans ce navigateur");
    }
  };

  const save = async () => {
    if (!payload.trim()) return;
    try {
      await api.records.create("qrcode", "history", {
        name: saveName.trim() || `QR ${type.label}`,
        typeId,
        values,
        options,
      });
      setSaveName("");
      await loadHistory();
      flash("Enregistré dans l'historique");
    } catch (err) {
      flash(err.message);
    }
  };

  const restore = (record) => {
    setTypeId(record.data.typeId);
    setValues(record.data.values || {});
    setOptions({ ...DEFAULT_OPTIONS, ...record.data.options });
  };

  const removeRecord = async (record) => {
    try {
      await api.records.remove("qrcode", "history", record.id);
      await loadHistory();
    } catch (err) {
      flash(err.message);
    }
  };

  return (
    <ModuleWindow manifest={manifest} className="qrGen">
      <div className="qrBody">
        {/* Colonne 1 : contenu */}
        <div className="qrPane win11Scroll">
          <div className="qrPaneTitle">Contenu</div>
          <div className="qrTypes">
            {TYPES.map((t) => (
              <div
                key={t.id}
                className="qrType handcr"
                data-active={t.id === typeId}
                onClick={() => {
                  setTypeId(t.id);
                  setValues({});
                }}
              >
                {t.label}
              </div>
            ))}
          </div>
          {type.fields.map((f) => (
            <label key={f.key} className="qrField">
              <span>{f.label}</span>
              {f.select ? (
                <select value={values[f.key] || f.select[0]} onChange={setValue(f.key)}>
                  {f.select.map((opt) => (
                    <option key={opt} value={opt}>
                      {(f.labels && f.labels[opt]) || opt}
                    </option>
                  ))}
                </select>
              ) : f.textarea ? (
                <textarea
                  rows={3}
                  value={values[f.key] || ""}
                  placeholder={f.placeholder}
                  onChange={setValue(f.key)}
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] || ""}
                  placeholder={f.placeholder}
                  onChange={setValue(f.key)}
                />
              )}
            </label>
          ))}

          <div className="qrPaneTitle qrMt">Apparence</div>
          <div className="qrOptRow">
            <label className="qrField qrHalf">
              <span>Taille : {options.size}px</span>
              <input
                type="range"
                min="128"
                max="1024"
                step="32"
                value={options.size}
                onChange={setOption("size", Number)}
              />
            </label>
            <label className="qrField qrHalf">
              <span>Marge : {options.margin}</span>
              <input
                type="range"
                min="0"
                max="8"
                value={options.margin}
                onChange={setOption("margin", Number)}
              />
            </label>
          </div>
          <div className="qrOptRow">
            <label className="qrField qrHalf">
              <span>Correction d'erreur</span>
              <select value={options.level} onChange={setOption("level")}>
                <option value="L">L — 7 %</option>
                <option value="M">M — 15 %</option>
                <option value="Q">Q — 25 %</option>
                <option value="H">H — 30 % (logo)</option>
              </select>
            </label>
            <div className="qrField qrHalf qrColors">
              <span>Couleurs</span>
              <div className="qrColorInputs">
                <input
                  type="color"
                  title="Motif"
                  value={options.dark}
                  onChange={setOption("dark")}
                />
                <input
                  type="color"
                  title="Fond"
                  value={options.light}
                  disabled={options.transparent}
                  onChange={setOption("light")}
                />
                <label className="qrCheck handcr">
                  <input
                    type="checkbox"
                    checked={options.transparent}
                    onChange={(e) =>
                      setOptions({ ...options, transparent: e.target.checked })
                    }
                  />
                  fond transparent
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne 2 : aperçu + actions */}
        <div className="qrPane qrPreviewPane">
          <div className="qrPaneTitle">Aperçu</div>
          <div className="qrPreview" data-empty={!dataUrl}>
            {dataUrl ? (
              <img src={dataUrl} alt="QR code" draggable={false} />
            ) : (
              <span>Renseignez le contenu pour générer le QR code</span>
            )}
          </div>
          <div className="qrPayload" title={payload}>
            {payload || "—"}
          </div>
          <div className="qrSave">
            <input
              type="text"
              placeholder="Nom (ex. Wi-Fi boutique)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveImage()}
            />
          </div>
          <div className="qrActions">
            <div
              className="qrBtn qrPrimary handcr"
              data-off={!dataUrl || busy}
              onClick={saveImage}
            >
              {busy ? "Enregistrement…" : "Enregistrer dans le cloud"}
            </div>
            <div className="qrBtn handcr" data-off={!dataUrl} onClick={download}>
              Télécharger
            </div>
            <div className="qrBtn handcr" data-off={!dataUrl} onClick={copyImage}>
              Copier
            </div>
          </div>
          <div className="qrActions">
            <div className="qrBtn handcr" data-off={!dataUrl} onClick={save}>
              Mémoriser dans l'historique
            </div>
          </div>
          {notice ? <div className="qrNotice">{notice}</div> : null}
        </div>

        {/* Colonne 3 : historique (partagé par l'espace de travail) */}
        <div className="qrPane qrHistPane win11Scroll">
          <div className="qrPaneTitle">Historique</div>
          {history.length === 0 ? (
            <div className="qrHistEmpty">
              Les QR enregistrés de votre espace de travail s'affichent ici.
            </div>
          ) : (
            history.map((record) => (
              <div key={record.id} className="qrHistRow">
                <div className="qrHistInfo handcr" onClick={() => restore(record)}>
                  <div className="qrHistName">{record.data.name}</div>
                  <div className="qrHistMeta">
                    {TYPES.find((t) => t.id === record.data.typeId)?.label || "?"}
                    {" · "}
                    {new Date(record.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="qrHistDel handcr" onClick={() => removeRecord(record)}>
                  ✕
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModuleWindow>
  );
}
