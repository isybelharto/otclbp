(function(){ "use strict";
  function attach() {
    const host=document.querySelector(".top-actions,.partner-top-actions,.topbar");
    if(!host)return false;
    if(!host.querySelector("[data-password-security-link]")){
      const link=document.createElement("a");
      link.href="change-password.html";link.textContent="Change password";
      link.dataset.passwordSecurityLink="true";
      link.style.cssText="font:600 12px Manrope,Arial,sans-serif;color:#1e40af;padding:8px 10px;border:1px solid #e2e8f0;border-radius:7px;background:#fff;text-decoration:none;white-space:nowrap";
      const menu=host.querySelector("#menu");
      if(menu)host.insertBefore(link,menu);else host.appendChild(link);
    }
    return true;
  }
  if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true});}
})();
