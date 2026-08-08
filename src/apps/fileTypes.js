// Associations de fichiers de CompanyOS.
//
// Un fichier du cloud sait quelle application l'ouvre : c'est ici que le
// lien se fait, et nulle part ailleurs. Ajouter un format se résume à
// compléter ce tableau — l'Explorateur, le menu contextuel et les
// visionneuses s'y réfèrent tous.

// `app` est l'identifiant de la fenêtre à ouvrir ; `action` est
// l'ancienne chaîne Redux, conservée comme clé d'abonnement des
// visionneuses.
const FAMILLES = [
  {
    genre: "image",
    label: "Image",
    app: "photos",
    action: "PHOTOS",
    icone: "photos",
    mime: /^image\//,
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "ico"],
  },
  {
    genre: "audio",
    label: "Audio",
    app: "groove",
    action: "MUSIQUE",
    icone: "groove",
    mime: /^audio\//,
    extensions: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba"],
  },
  {
    genre: "pdf",
    label: "Document PDF",
    app: "pdf",
    action: "PDFAPP",
    icone: "pdf",
    mime: /^application\/pdf$/,
    extensions: ["pdf"],
  },
  {
    genre: "video",
    label: "Vidéo",
    app: "movies",
    action: "VIDEOAPP",
    icone: "movies",
    mime: /^video\//,
    // `mkv` et `avi` sont listés parce qu'un navigateur *peut* les lire
    // selon les codecs présents ; la visionneuse prévient si elle échoue.
    extensions: ["mp4", "webm", "ogv", "mov", "m4v", "mkv", "avi"],
  },
  {
    genre: "document",
    label: "Document Word",
    app: "word",
    action: "WORDAPP",
    icone: "winWord",
    mime: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml/,
    // Seulement le format réel de l'éditeur : un `.doc` historique est un
    // autre format (binaire ou HTML), l'ouvrir ici échouerait.
    extensions: ["docx"],
  },
  {
    genre: "presentation",
    label: "Présentation PowerPoint",
    app: "presentation",
    action: "PRESENTATIONAPP",
    icone: "presentation",
    mime: /^application\/vnd\.openxmlformats-officedocument\.presentationml/,
    // Seul le format réel de l'éditeur : un `.ppt` historique est un autre
    // format (binaire), l'ouvrir ici échouerait.
    extensions: ["pptx"],
  },
  {
    genre: "objet3d",
    label: "Modèle 3D",
    app: "objet3d",
    action: "OBJET3D",
    icone: "objet3d",
    // `model/*` est le type officiel (glTF, STL…), mais la plupart des
    // serveurs — le nôtre compris — renvoient `application/octet-stream`
    // pour ces fichiers : l'extension fait le vrai travail ici.
    mime: /^model\//,
    extensions: ["glb", "gltf", "obj", "stl", "fbx", "ply", "dae"],
  },
];

const extension = (nom = "") => {
  const point = nom.lastIndexOf(".");
  return point > 0 ? nom.slice(point + 1).toLowerCase() : "";
};

/// La famille d'un nœud, ou null si aucune application ne sait l'ouvrir.
/// Le type MIME prime — il vient du serveur — et l'extension sert de
/// repli quand le MIME est générique (les envois arrivent souvent en
/// `application/octet-stream`).
export const familleDe = (node) => {
  if (!node || node.type !== "FILE") return null;
  const ext = extension(node.name);
  return (
    FAMILLES.find((f) => node.mimeType && f.mime.test(node.mimeType)) ||
    FAMILLES.find((f) => f.extensions.includes(ext)) ||
    null
  );
};

export const estOuvrable = (node) => familleDe(node) !== null;

/// Les fichiers du même genre dans une liste — la galerie de la
/// visionneuse d'images, la liste de lecture du lecteur audio.
export const memeGenre = (nodes, genre) =>
  nodes.filter((n) => familleDe(n)?.genre === genre);

/// 150 Mo : au-delà, charger le fichier entier en mémoire pour le lire
/// coûte plus que ça ne rend service. La visionneuse propose alors le
/// téléchargement.
export const TAILLE_MAX_LECTURE = 150 * 1024 * 1024;
