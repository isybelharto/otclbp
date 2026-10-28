(function () {
  'use strict';
  const url = 'https://biwwfxfpcsanszxrxhyw.supabase.co';
  const key = 'sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb';
  const base = 'https://management.ptlbp.co.id/corporate-client/';
  const client = window.supabase.createClient(url, key, { auth: { storageKey: 'lbp-corporate-client-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const companyEmail = email => {
    const value = String(email || '').trim().toLowerCase();
    const domain = value.split('@')[1] || '';
    const blocked = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid company email.';
    if (blocked.includes(domain)) return 'Use an authorised company email, not a personal email service.';
    return '';
  };
  const passwordErrors = (password, confirmation = password) => {
    const errors = [];
    if (password.length < 8) errors.push('Use at least 8 characters.');
    if (!/[A-Z]/.test(password)) errors.push('Include one capital letter.');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('Include one special character.');
    if (/(.)\1\1/i.test(password)) errors.push('Do not repeat a character 3 times.');
    if (password !== confirmation) errors.push('Passwords must match.');
    return errors;
  };
  async function profile() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data: currentProfile } = await client.from('profiles').select('id,full_name,role,is_active,client_id').eq('id', session.user.id).maybeSingle();
    return currentProfile && currentProfile.role === 'corporate_client' && currentProfile.is_active ? { session, profile: currentProfile } : null;
  }
  async function register(values) {
    const emailError = companyEmail(values.email);
    const passwordError = passwordErrors(values.password, values.confirmation)[0];
    if (emailError || passwordError) throw new Error(emailError || passwordError);
    if (!values.captchaToken) throw new Error('Complete the security verification before registering.');
    const { data, error } = await client.auth.signUp({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      options: {
        captchaToken: values.captchaToken,
        emailRedirectTo: new URL('login.html?verified=1', base).href,
        data: { registration_type: 'corporate_client', company_name: values.company.trim(), contact_name: values.name.trim(), phone: values.phone.trim(), tier: values.tier }
      }
    });
    if (error) throw error;
    if (data.session) await client.auth.signOut();
    return data;
  }
  async function verify(email, token) {
    const { data, error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.replace(/\D/g, ''), type: 'email' });
    if (error) throw error;
    if (data.session) await client.auth.signOut();
    return data;
  }
  async function reset(email, captchaToken) {
    const emailError = companyEmail(email);
    if (emailError) throw new Error(emailError);
    if (!captchaToken) throw new Error('Complete the security verification before requesting a password reset.');
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: new URL('recovery.html', base).href,
      captchaToken,
    });
    if (error) throw error;
  }
  window.LBPCorporate = { client, companyEmail, passwordErrors, profile, register, verify, reset };
})();
