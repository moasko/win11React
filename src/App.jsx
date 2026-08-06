import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";
import "./i18nextConf";
import "./index.css";

import ActMenu from "./components/menu";
import {
  BandPane,
  CalnWid,
  DesktopApp,
  SidePane,
  StartMenu,
} from "./components/start";
import Taskbar from "./components/taskbar";
import { Background, BootScreen, LockScreen } from "./containers/background";

import { loadSettings } from "./actions";
import * as Applications from "./containers/applications";
import * as Drafts from "./containers/applications/draft";
import { modules } from "./apps/registry";
import { syncInstalledModules, detachAllModules } from "./apps/sync";
import { api, getToken, clearToken } from "./api/client";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="crashScreen">
      <div className="crashCont">
        <h1>:(</h1>
        <h2>
          CompanyOS a rencontré un problème et doit redémarrer la session. Vos
          données ouvertes ne sont pas perdues.
        </h2>
        <div className="stopcode">
          <h4>Code d'arrêt</h4>
          <pre>{error.message}</pre>
          <button onClick={resetErrorBoundary}>Redémarrer la session</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const apps = useSelector((state) => state.apps);
  const wall = useSelector((state) => state.wallpaper);
  const session = useSelector((state) => state.session);
  const dispatch = useDispatch();

  const afterMath = (event) => {
    var ess = [
      ["START", "STARTHID"],
      ["BAND", "BANDHIDE"],
      ["PANE", "PANEHIDE"],
      ["CALN", "CALNHIDE"],
      ["MENU", "MENUHIDE"],
    ];

    var actionType = "";
    try {
      actionType = event.target.dataset.action || "";
    } catch (err) {}

    var actionType0 = getComputedStyle(event.target).getPropertyValue(
      "--prefix",
    );

    ess.forEach((item, i) => {
      if (!actionType.startsWith(item[0]) && !actionType0.startsWith(item[0])) {
        dispatch({
          type: item[1],
        });
      }
    });
  };

  window.oncontextmenu = (e) => {
    afterMath(e);
    e.preventDefault();
    // dispatch({ type: 'GARBAGE'});
    var data = {
      top: e.clientY,
      left: e.clientX,
    };

    if (e.target.dataset.menu != null) {
      data.menu = e.target.dataset.menu;
      data.attr = e.target.attributes;
      data.dataset = e.target.dataset;
      dispatch({
        type: "MENUSHOW",
        payload: data,
      });
    }
  };

  window.onclick = afterMath;

  window.onload = (e) => {
    dispatch({ type: "WALLBOOTED" });
  };

  // Restauration de session : un jeton valide en localStorage remet
  // l'espace de travail et ses modules en place, écran verrouillé ou non.
  useEffect(() => {
    const boot = async () => {
      if (!getToken()) {
        dispatch({ type: "SESSION_CLEAR" });
        return;
      }
      try {
        const me = await api.me();
        dispatch({ type: "SESSION_SET", payload: me });
        dispatch({
          type: "STNGSETV",
          payload: { path: "person.name", value: me.user.name },
        });
        await syncInstalledModules();
      } catch {
        clearToken();
        dispatch({ type: "SESSION_CLEAR" });
        detachAllModules();
      }
    };
    boot();
  }, []);

  // Sans session, pas de bureau : on revient à l'écran de connexion.
  useEffect(() => {
    if (session.status === "anonymous" && !wall.locked) {
      dispatch({ type: "WALLALOCK" });
    }
  }, [session.status, wall.locked]);

  useEffect(() => {
    if (!window.onstart) {
      loadSettings();
      window.onstart = setTimeout(() => {
        // console.log("prematurely loading ( ﾉ ﾟｰﾟ)ﾉ");
        dispatch({ type: "WALLBOOTED" });
      }, 5000);
    }
  });

  return (
    <div className="App">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {!wall.booted ? <BootScreen dir={wall.dir} /> : null}
        {wall.locked ? <LockScreen dir={wall.dir} /> : null}
        <div className="appwrap">
          <Background />
          <div className="desktop" data-menu="desk">
            <DesktopApp />
            {Object.keys(Applications).map((key, idx) => {
              var WinApp = Applications[key];
              return <WinApp key={idx} />;
            })}
            {/* Modules métier : ModuleWindow ne rend rien tant que le
                module n'est pas installé dans l'espace de travail. */}
            {modules.map((mod) => {
              const ModWindow = mod.Window;
              return <ModWindow key={mod.slug} />;
            })}
            {Object.keys(apps)
              .filter((x) => x != "hz")
              .map((key) => apps[key])
              .map((app, i) => {
                if (app.pwa) {
                  var WinApp = Drafts[app.data.type];
                  return <WinApp key={i} icon={app.icon} {...app.data} />;
                }
              })}
            <StartMenu />
            <BandPane />
            <SidePane />
            <CalnWid />
          </div>
          <Taskbar />
          <ActMenu />
        </div>
      </ErrorBoundary>
    </div>
  );
}

export default App;
