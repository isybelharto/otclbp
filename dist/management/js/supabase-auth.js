(function initialiseLbpManagementAuth() {
  "use strict";

  const client = window.LBPSupabase;
  const isLoginPage = window.location.pathname.endsWith("/login.html");

  function loginUrl(reason) {
    const next = window.location.pathname + window.location.search + window.location.hash;
    const query = new URLSearchParams({ next });
    if (reason) query.set("error", reason);
    return `login.html?${query.toString()}`;
  }

  function dashboardUrl() {
    const requested = new URLSearchParams(window.location.search).get("next");
    return requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "./";
  }

  async function getManagementProfile(userId) {
    const { data, error } = await client
      .from("profiles")
      .select("full_name, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  function applyProfile(profile, email) {
    document.documentElement.classList.remove("auth-pending");
    const switcher = document.querySelector("#role-switcher");
    if (switcher) switcher.title = `Signed in as ${email}`;

    const topActions = document.querySelector(".top-actions");
    if (topActions && !topActions.querySelector("[data-lbp-signout]")) {
      const signOut = document.createElement("button");
      signOut.type = "button";
      signOut.className = "profile";
      signOut.dataset.lbpSignout = "true";
      signOut.textContent = "Sign out";
      signOut.addEventListener("click", async () => {
        await client.auth.signOut();
        window.location.replace("login.html");
      });
      topActions.appendChild(signOut);
    }

    window.dispatchEvent(new CustomEvent("lbp:management-ready", {
      detail: { profile, email },
    }));
  }

  async function requireManagement() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.replace(loginUrl());
      return null;
    }

    try {
      const profile = await getManagementProfile(session.user.id);
      if (!profile || profile.role !== "management" || !profile.is_active) {
        await client.auth.signOut();
        window.location.replace(loginUrl("unauthorized"));
        return null;
      }
      applyProfile(profile, session.user.email || "");
      return { profile, user: session.user };
    } catch (error) {
      console.error("Management authorization failed.", error);
      window.location.replace(loginUrl("authorization"));
      return null;
    }
  }

  async function signIn(email, password, captchaToken) {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    if (error) throw error;
    return data;
  }

  window.LBPManagementAuth = {
    client,
    dashboardUrl,
    getManagementProfile,
    requireManagement,
    signIn,
    signOut: () => client.auth.signOut(),
  };

  window.LBPManagementAuth.ready = isLoginPage
    ? Promise.resolve(null)
    : requireManagement();
})();
