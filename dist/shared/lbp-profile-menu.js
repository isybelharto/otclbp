(function attachLbpProfileMenu() {
  "use strict";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const initials = (name, email) => String(name || email || "LBP").trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LB";

  window.LBPProfileMenu = {
    mount({ container, client, session, profile, changePasswordHref, loginHref }) {
      if (!container || !client || !session) return;
      const user = session.user;
      const metadata = user.user_metadata || {};
      const displayName = profile?.full_name || metadata.contact_name || user.email;
      const avatar = metadata.avatar_data_url || "";
      container.innerHTML = `<div class="lbp-profile-menu">
        <button class="lbp-profile-trigger" type="button" aria-expanded="false" aria-label="Open profile menu">
          <span class="lbp-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : escapeHtml(initials(displayName, user.email))}</span>
          <span class="lbp-profile-trigger-name">${escapeHtml(displayName)}</span><span aria-hidden="true">⌄</span>
        </button>
        <section class="lbp-profile-popover" hidden>
          <div class="lbp-profile-summary"><span class="lbp-avatar large">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : escapeHtml(initials(displayName, user.email))}</span><div><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(user.email || "")}</small></div></div>
          <label class="lbp-avatar-upload"><span>Profile photo</span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose profile photo"><small>PNG, JPG, or WebP — max. 300 KB</small></label>
          <label class="lbp-profile-field"><span>Change email</span><input type="email" value="${escapeHtml(user.email || "")}" autocomplete="email"><small>Email changes require confirmation from both addresses where configured.</small></label>
          <button class="lbp-profile-save-email" type="button">Update email</button>
          <a class="lbp-profile-link" href="${escapeHtml(changePasswordHref)}">Change password</a>
          <button class="lbp-profile-signout" type="button">Sign out</button>
          <p class="lbp-profile-status" aria-live="polite"></p>
        </section>
      </div>`;
      const root = container.querySelector(".lbp-profile-menu");
      const trigger = root.querySelector(".lbp-profile-trigger");
      const popover = root.querySelector(".lbp-profile-popover");
      const status = root.querySelector(".lbp-profile-status");
      const show = (message, error = false) => { status.textContent = message; status.classList.toggle("error", error); };
      trigger.addEventListener("click", () => { const open = popover.hidden; popover.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); });
      document.addEventListener("click", (event) => { if (!root.contains(event.target)) { popover.hidden = true; trigger.setAttribute("aria-expanded", "false"); } });
      root.querySelector("input[type=file]").addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 307200) { show("Profile photo must be 300 KB or smaller.", true); event.target.value = ""; return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const { error } = await client.auth.updateUser({ data: { ...metadata, avatar_data_url: reader.result } });
          if (error) return show(error.message, true);
          show("Profile photo updated. Refresh the page to load it everywhere.");
          root.querySelectorAll(".lbp-avatar").forEach((node) => { node.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="">`; });
        };
        reader.readAsDataURL(file);
      });
      root.querySelector(".lbp-profile-save-email").addEventListener("click", async () => {
        const email = root.querySelector("input[type=email]").value.trim().toLowerCase();
        if (!email || email === String(user.email || "").toLowerCase()) return show("Enter a different email address.", true);
        const { error } = await client.auth.updateUser({ email });
        if (error) return show(error.message, true);
        show("Confirmation instructions have been sent to your email address.");
      });
      root.querySelector(".lbp-profile-signout").addEventListener("click", async () => { await client.auth.signOut(); window.location.replace(loginHref); });
    },
  };
})();
