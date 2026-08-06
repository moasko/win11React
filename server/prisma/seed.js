import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/// Catalogue de départ de la Boutique.
/// `isCore` = installé d'office à la création d'un espace de travail.
const apps = [
  {
    slug: "explorer",
    name: "Explorateur de fichiers",
    description: "Parcourir et gérer l'espace de stockage de l'entreprise.",
    icon: "explorer",
    category: "Système",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "settings",
    name: "Paramètres",
    description: "Configurer l'espace de travail, les comptes et l'apparence.",
    icon: "settings",
    category: "Système",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "store",
    name: "Boutique",
    description: "Installer de nouveaux modules de gestion.",
    icon: "store",
    category: "Système",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "browser",
    name: "Navigateur",
    description: "Ouvrir un outil externe dans une fenêtre de CompanyOS.",
    icon: "edge",
    category: "Système",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "terminal",
    name: "Terminal",
    description: "Console d'administration de l'espace de travail.",
    icon: "terminal",
    category: "Système",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "notepad",
    name: "Bloc-notes",
    description: "Prendre des notes rapides.",
    icon: "notepad",
    category: "Bureautique",
    kind: "NATIVE",
    isCore: true,
  },
  {
    slug: "calculator",
    name: "Calculatrice",
    description: "Calculs courants et conversions.",
    icon: "calculator",
    category: "Bureautique",
    kind: "NATIVE",
    isCore: true,
  },
  // Modules installables depuis la Boutique.
  {
    slug: "qrcode",
    name: "Générateur QR",
    description:
      "QR codes avancés : lien, Wi-Fi, carte de visite, e-mail, SMS. Couleurs, taille, correction d'erreur et historique partagé.",
    icon: "code",
    category: "Outils",
    kind: "NATIVE",
  },
  // Modules dont le composant reste à écrire côté shell.
  {
    slug: "crm",
    name: "CRM",
    description: "Clients, contacts, opportunités et suivi commercial.",
    icon: "people",
    category: "Gestion",
    kind: "NATIVE",
  },
  {
    slug: "facturation",
    name: "Facturation",
    description: "Devis, factures, relances et suivi des règlements.",
    icon: "msoffice",
    category: "Gestion",
    kind: "NATIVE",
  },
  {
    slug: "stock",
    name: "Stock",
    description: "Articles, entrées/sorties et inventaire.",
    icon: "excel",
    category: "Gestion",
    kind: "NATIVE",
  },
  {
    slug: "rh",
    name: "Ressources humaines",
    description: "Salariés, contrats, congés et absences.",
    icon: "yphone",
    category: "Gestion",
    kind: "NATIVE",
  },
  {
    slug: "comptabilite",
    name: "Comptabilité",
    description: "Journaux, grand livre et rapprochement bancaire.",
    icon: "onenote",
    category: "Gestion",
    kind: "NATIVE",
  },
  {
    slug: "projets",
    name: "Projets",
    description: "Tâches, jalons et temps passé par projet.",
    icon: "todo",
    category: "Gestion",
    kind: "NATIVE",
  },
];

for (const app of apps) {
  await prisma.app.upsert({
    where: { slug: app.slug },
    update: app,
    create: app,
  });
}

console.log(`Catalogue initialisé : ${apps.length} applications.`);
await prisma.$disconnect();
