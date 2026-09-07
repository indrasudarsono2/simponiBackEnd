// The public API can be mounted at /backend even though Express sees /api.
export function shouldEnforceHttpsRedirect(isProduction, configuredValue) {
  return isProduction && configuredValue !== 'false';
}

export function requireHttps(publicBaseUrl) {
  const base = new URL(publicBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('SIMPONI_PUBLIC_BASE_URL must be a credential-free HTTPS URL without query or fragment.');
  }
  const prefix = base.pathname.replace(/\/+$/, '');
  return (req, res, next) => {
    // Express evaluates the forwarded protocol using the configured trusted peer.
    if (req.secure) return next();
    const incoming = req.originalUrl.startsWith('/') ? req.originalUrl : `/${req.originalUrl}`;
    const pathname = incoming.split('?')[0];
    const alreadyPrefixed = prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`));
    const target = `${base.origin}${alreadyPrefixed ? '' : prefix}${incoming}`;
    // Never permanently cache a proxy-configuration failure in the browser.
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(307, target);
  };
}
