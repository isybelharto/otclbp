(function () {
  "use strict";
  function passwordErrors(password, confirmation) {
    const errors = [];
    if (typeof password !== "string" || password.length < 8) errors.push("Use at least 8 characters.");
    if (!/[A-Z]/.test(password)) errors.push("Include a capital letter.");
    if (!/[^A-Za-z0-9]/.test(password)) errors.push("Include a special character.");
    if (/(.)\1\1/i.test(password)) errors.push("Do not repeat a character 3 times.");
    if (password !== confirmation) errors.push("Both password fields must match.");
    return errors;
  }
  function createFlow(client) {
    let challengedUser = null;
    async function currentUser() {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) throw new Error("Your session has expired. Sign in or open a new password recovery link.");
      if (!data.user.email || !data.user.email_confirmed_at) throw new Error("Verify your company email before changing your password.");
      return data.user;
    }
    return {
      async sendCode() {
        challengedUser = null;
        const user = await currentUser();
        const { error } = await client.auth.reauthenticate();
        if (error) throw error;
        challengedUser = user.id;
        return user.email;
      },
      async update(password, confirmation, nonce) {
        const errors = passwordErrors(password, confirmation);
        if (errors.length) throw new Error(errors[0]);
        if (!challengedUser) throw new Error("Request a verification PIN before updating your password.");
        if (!/^\d{6}$/.test(String(nonce || "").trim())) throw new Error("Enter the complete 6-digit verification PIN.");
        const user = await currentUser();
        if (user.id !== challengedUser) { challengedUser = null; throw new Error("The account changed. Request a new PIN."); }
        const { error } = await client.auth.updateUser({ password, nonce: String(nonce).trim() });
        if (error) throw error;
        challengedUser = null;
        const { error: signOutError } = await client.auth.signOut({ scope: "global" });
        if (signOutError) await client.auth.signOut({ scope: "local" });
        return { updated: true, sessionsRevoked: !signOutError };
      }
    };
  }
  window.LBPPasswordSecurity = { createFlow, passwordErrors };
  const form = document.getElementById("password-security-form");
  if (!form) return;
  const moduleName = document.body.dataset.passwordModule;
  const client = moduleName === "management" ? window.LBPSupabase :
    moduleName === "partner" ? window.LBPPartnerDeskSupabase?.client : window.LBPCorporate?.client;
  const message = document.getElementById("password-security-status");
  if (!client) { message.textContent = "Secure account access could not be loaded. Refresh this page."; return; }
  const flow = createFlow(client);
  const send = document.getElementById("send-password-code");
  const submit = document.getElementById("save-password");
  const code = document.getElementById("password-nonce");
  const password = document.getElementById("new-password");
  const confirm = document.getElementById("confirm-password");
  let cooldown;
  function status(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#dc2626" : "#059669";
  }
  code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 6); });
  send.addEventListener("click", async () => {
    send.disabled = true; submit.disabled = true;
    try {
      const email = await flow.sendCode();
      document.getElementById("password-pin-section").hidden = false;
      status("A verification PIN was sent to " + email + ".");
      code.value = ""; code.focus(); submit.disabled = false;
      let seconds = 60;
      clearInterval(cooldown);
      send.textContent = "Resend PIN in " + seconds + "s";
      cooldown = setInterval(() => {
        seconds -= 1;
        send.textContent = seconds > 0 ? "Resend PIN in " + seconds + "s" : "Send verification PIN";
        if (seconds <= 0) { clearInterval(cooldown); send.disabled = false; }
      }, 1000);
    } catch (error) { status(error.message || "The PIN could not be sent. Try again.", true); send.disabled = false; }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    try {
      const result = await flow.update(password.value, confirm.value, code.value);
      form.reset(); clearInterval(cooldown); send.disabled = true;
      status(result.sessionsRevoked ? "Password updated in Supabase. Please sign in again." : "Password updated. Please sign in again; other sessions could not be revoked.");
      document.getElementById("password-signin").hidden = false;
    } catch (error) { status(error.message || "Password update failed.", true); submit.disabled = false; }
  });
})();
