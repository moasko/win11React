import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Icon, Image } from "../../utils/general";
import { api, setToken, clearToken } from "../../api/client";
import { syncInstalledModules, detachAllModules } from "../../apps/sync";
import "./back.scss";

export const Background = () => {
  const wall = useSelector((state) => state.wallpaper);
  const dispatch = useDispatch();

  return (
    <div
      className="background"
      style={{
        backgroundImage: `url(img/wallpaper/${wall.src})`,
      }}
    ></div>
  );
};

export const BootScreen = (props) => {
  const dispatch = useDispatch();
  const wall = useSelector((state) => state.wallpaper);
  const [blackout, setBlackOut] = useState(false);

  useEffect(() => {
    if (props.dir < 0) {
      setTimeout(() => {
        console.log("blackout");
        setBlackOut(true);
      }, 4000);
    }
  }, [props.dir]);

  useEffect(() => {
    if (props.dir < 0) {
      if (blackout) {
        if (wall.act == "restart") {
          setTimeout(() => {
            setBlackOut(false);
            setTimeout(() => {
              dispatch({ type: "WALLBOOTED" });
            }, 4000);
          }, 2000);
        }
      }
    }
  }, [blackout]);

  return (
    <div className="bootscreen">
      <div className={blackout ? "hidden" : ""}>
        <Image src="asset/bootlogo" w={180} />
        <div className="mt-48" id="loader">
          <svg
            className="progressRing"
            height={48}
            width={48}
            viewBox="0 0 16 16"
          >
            <circle cx="8px" cy="8px" r="7px"></circle>
          </svg>
        </div>
      </div>
    </div>
  );
};

export const LockScreen = (props) => {
  const session = useSelector((state) => state.session);
  const [lock, setLock] = useState(false);
  const [unlocked, setUnLock] = useState(false);
  // "login" ou "register"
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ company: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dispatch = useDispatch();

  const proceed = () => {
    setUnLock(true);
    setTimeout(() => {
      dispatch({ type: "WALLUNLOCK" });
    }, 1000);
  };

  const field = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    setError("");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await api.login({ email: form.email, password: form.password })
          : await api.register(form);
      setToken(result.token);
      dispatch({ type: "SESSION_SET", payload: result });
      dispatch({ type: "STNGSETV", payload: { path: "person.name", value: result.user.name } });
      await syncInstalledModules();
      proceed();
    } catch (err) {
      setError(err.message || "Connexion impossible");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") submit();
  };

  const authenticated = session.status === "authenticated";

  return (
    <div
      className={"lockscreen " + (props.dir == -1 ? "slowfadein" : "")}
      data-unlock={unlocked}
      style={{
        backgroundImage: `url(${`img/wallpaper/lock.jpg`})`,
      }}
      onClick={() => setLock(true)}
      data-blur={lock}
    >
      <div className="splashScreen mt-40" data-faded={lock}>
        <div className="text-6xl font-semibold text-gray-100">
          {new Date().toLocaleTimeString("fr-FR", {
            hour: "numeric",
            minute: "numeric",
          })}
        </div>
        <div className="text-lg font-medium text-gray-200">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>
      <div
        className="fadeinScreen"
        data-faded={!lock}
        data-unlock={unlocked}
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          className="rounded-full overflow-hidden"
          src="img/asset/prof.jpg"
          w={120}
          ext
        />
        {authenticated ? (
          <>
            <div className="mt-2 text-2xl font-medium text-gray-200">
              {session.user.name}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {session.tenant.name}
            </div>
            <div className="flex items-center mt-6 signInBtn" onClick={proceed}>
              Ouvrir mon espace
            </div>
            <div
              className="text-xs text-gray-400 mt-4 handcr"
              onClick={() => {
                clearToken();
                dispatch({ type: "SESSION_CLEAR" });
                detachAllModules();
              }}
            >
              Changer de compte
            </div>
          </>
        ) : (
          <div className="authForm mt-4">
            <div className="text-xl font-medium text-gray-200 mb-3">
              {mode === "login" ? "Connexion à CompanyOS" : "Créer votre espace de travail"}
            </div>
            {mode === "register" && (
              <>
                <input
                  type="text"
                  placeholder="Nom de l'entreprise"
                  value={form.company}
                  onChange={field("company")}
                  onKeyDown={onKey}
                />
                <input
                  type="text"
                  placeholder="Votre nom"
                  value={form.name}
                  onChange={field("name")}
                  onKeyDown={onKey}
                />
              </>
            )}
            <input
              type="email"
              placeholder="Adresse e-mail"
              value={form.email}
              onChange={field("email")}
              onKeyDown={onKey}
              autoFocus
            />
            <input
              type="password"
              placeholder={mode === "register" ? "Mot de passe (8 caractères min.)" : "Mot de passe"}
              value={form.password}
              onChange={field("password")}
              onKeyDown={onKey}
            />
            {error ? <div className="authError">{error}</div> : null}
            <div className="flex items-center mt-4 signInBtn" onClick={submit}>
              {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon espace"}
            </div>
            <div
              className="text-xs text-gray-400 mt-4 handcr"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login"
                ? "Pas encore de compte ? Créer un espace de travail"
                : "Déjà un compte ? Se connecter"}
            </div>
          </div>
        )}
      </div>
      <div className="bottomInfo flex">
        <span className="lockBrand">CompanyOS</span>
      </div>
    </div>
  );
};
