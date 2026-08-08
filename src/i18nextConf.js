import i18n from "i18next";
import { initReactI18next } from "react-i18next";
// `i18next-http-backend` remplace `i18next-xhr-backend`, abandonné par ses
// auteurs depuis 2020 : même rôle (charger les JSON de traduction), API
// d'options identique pour notre usage.
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

// L'interface de CompanyOS est écrite en français, directement dans les
// composants : i18next ne traduit pas le shell. Son seul consommateur réel
// est le module Présentations, dont le moteur appelle `useTranslation()` et
// reçoit ses chaînes françaises par `addResourceBundle` **sur la langue
// interne « en »** (voir src/apps/modules/presentation/Editeur.jsx). C'est
// pourquoi « en » doit rester la langue résolue : la changer casserait ces
// bundles. `public/locales/en/translate.json` est vide et ne sert qu'à
// éviter un 404 du backend.
//
// Le jour d'une vraie internationalisation : extraire les chaînes du shell
// vers `locales/<lng>/translate.json`, ajouter la langue ci-dessous, et
// enregistrer les bundles du module Présentations par langue.
const fallbackLng = ["en"];
const availableLanguages = ["en"];

i18n
  .use(Backend) // load translations using http (default public/assets/locals/en/translations)
  .use(LanguageDetector) // detect user language
  .use(initReactI18next) // pass the i18n instance to react-i18next.
  .init({
    fallbackLng, // fallback language is english.

    backend: {
      loadPath: "locales/{{lng}}/translate.json",
    },

    debug: false,

    // `whitelist` / `checkWhitelist` sont les noms d'avant i18next 20 :
    // silencieusement ignorés en 21, d'où la requête « fr » malgré la
    // liste. Ce sont désormais `supportedLngs` / `nonExplicitSupportedLngs`.
    supportedLngs: availableLanguages,
    nonExplicitSupportedLngs: true,

    // `languageOnly` retire la région de la langue détectée. Sans lui,
    // un navigateur réglé sur « en-US » réclame d'abord
    // `locales/en-US/translate.json` — qui n'existe pas — et encaisse un 404
    // avant de se rabattre sur « en ». Le repli fonctionne, mais l'erreur
    // reste dans la console à chaque démarrage.
    load: "languageOnly",

    interpolation: {
      escapeValue: false, // no need for react. it escapes by default
    },
  });

export default i18n;
