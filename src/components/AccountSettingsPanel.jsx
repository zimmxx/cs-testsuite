import { useState } from "react";

export default function AccountSettingsPanel({ session, onLogin, onBootstrap, onLogout, busy, oneTimeApiKey }) {
  const [apiKey, setApiKey] = useState("");
  const user = session?.user;

  async function submitLogin(event) {
    event.preventDefault();
    await onLogin(apiKey);
    setApiKey("");
  }

  return (
    <article className="analysis-card account-settings-card">
      <div className="analysis-card-head">
        <div>
          <h2>Library Account &amp; Access</h2>
          <p>Guests can use public datasets without signing in. An approved API key unlocks only the private partner libraries assigned to that account.</p>
        </div>
        {user ? <span className={`access-role-badge ${user.role}`}>{user.role}</span> : <span className="access-role-badge guest">guest</span>}
      </div>

      {user ? (
        <div className="account-session-grid">
          <div className="account-session-summary">
            <strong>{user.name}</strong>
            <span>{user.role === "admin" ? "Administrator access" : `${user.role} access`}</span>
            <small>Libraries: {user.role === "admin" ? "All private libraries" : user.accessGroups?.join(", ") || "None assigned"}</small>
          </div>
          <button type="button" className="ghost-action" onClick={onLogout}>Sign out</button>
        </div>
      ) : (
        <form className="account-login-form" onSubmit={submitLogin}>
          <label className="mapping-field">
            <span>Private-library API key</span>
            <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="cst_..." />
          </label>
          <button type="submit" disabled={!apiKey.trim() || busy}>{busy ? "Signing in..." : "Sign in"}</button>
          {session?.bootstrapAvailable ? <button type="button" className="secondary-action" onClick={onBootstrap} disabled={busy}>Create Aiman admin account</button> : null}
        </form>
      )}

      {oneTimeApiKey ? (
        <div className="one-time-key" role="status">
          <strong>Copy this API key now</strong>
          <code>{oneTimeApiKey}</code>
          <span>It is shown once. Store it in a password manager; only its hash is retained by the local service.</span>
        </div>
      ) : null}

      <div className="security-note">
        <strong>Security boundary</strong>
        <span>Private files are served through the authenticated local API and remain outside the public Vite assets. For deployment, connect the same API contract to a server-side service and a separate private GitHub repository.</span>
      </div>
    </article>
  );
}
