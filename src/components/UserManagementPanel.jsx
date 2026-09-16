import { useEffect, useState } from "react";

function groupList(value) {
  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export default function UserManagementPanel({ users, onRefresh, onCreate, onUpdate, onRotate, busy, oneTimeApiKey }) {
  const [draft, setDraft] = useState({ name: "", role: "viewer", accessGroups: "dtu" });
  const [edits, setEdits] = useState({});

  useEffect(() => {
    setEdits(Object.fromEntries(users.map((user) => [user.id, { name: user.name, role: user.role, status: user.status, accessGroups: (user.accessGroups || []).join(", ") }])));
  }, [users]);

  async function createUser(event) {
    event.preventDefault();
    await onCreate({ ...draft, accessGroups: groupList(draft.accessGroups) });
    setDraft({ name: "", role: "viewer", accessGroups: "dtu" });
  }

  return (
    <section className="library-stack workspace-fit-view">
      <article className="analysis-card">
        <div className="analysis-card-head">
          <div>
            <h2>User Management</h2>
            <p>Admin-only controls for private-library accounts, partner access groups, edit permission, revocation, and API-key rotation.</p>
          </div>
          <button type="button" className="ghost-action" onClick={onRefresh} disabled={busy}>Refresh users</button>
        </div>

        <form className="user-create-grid" onSubmit={createUser}>
          <label className="mapping-field"><span>User name</span><input required value={draft.name} onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="DTU collaborator" /></label>
          <label className="mapping-field"><span>Role</span><select value={draft.role} onChange={(event) => setDraft((previous) => ({ ...previous, role: event.target.value }))}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label>
          <label className="mapping-field"><span>Library access groups</span><input value={draft.accessGroups} onChange={(event) => setDraft((previous) => ({ ...previous, accessGroups: event.target.value }))} placeholder="dtu, internal" /></label>
          <button type="submit" disabled={busy}>{busy ? "Working..." : "Create user + API key"}</button>
        </form>

        {oneTimeApiKey ? <div className="one-time-key" role="status"><strong>New API key — copy now</strong><code>{oneTimeApiKey}</code><span>This key will not be shown again after you leave this screen.</span></div> : null}
      </article>

      <article className="analysis-card">
        <div className="dashboard-table-wrap">
          <table className="user-management-table">
            <thead><tr><th>User</th><th>Role</th><th>Access groups</th><th>Status / key</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((user) => {
                const edit = edits[user.id] || {};
                return (
                  <tr key={user.id}>
                    <td><input aria-label={`${user.name} name`} value={edit.name || ""} onChange={(event) => setEdits((previous) => ({ ...previous, [user.id]: { ...edit, name: event.target.value } }))} /></td>
                    <td>{user.role === "admin" ? <strong>Admin</strong> : <select aria-label={`${user.name} role`} value={edit.role || "viewer"} onChange={(event) => setEdits((previous) => ({ ...previous, [user.id]: { ...edit, role: event.target.value } }))}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>}</td>
                    <td><input aria-label={`${user.name} access groups`} value={edit.accessGroups || ""} onChange={(event) => setEdits((previous) => ({ ...previous, [user.id]: { ...edit, accessGroups: event.target.value } }))} /></td>
                    <td><select aria-label={`${user.name} status`} value={edit.status || "active"} disabled={user.role === "admin"} onChange={(event) => setEdits((previous) => ({ ...previous, [user.id]: { ...edit, status: event.target.value } }))}><option value="active">Active</option><option value="revoked">Revoked</option></select><small>Key …{user.apiKeyHint || "------"}</small></td>
                    <td className="library-table-actions"><button type="button" onClick={() => onUpdate({ id: user.id, ...edit, accessGroups: groupList(edit.accessGroups) })} disabled={busy}>Save</button><button type="button" className="secondary-action" onClick={() => onRotate(user.id)} disabled={busy}>Rotate key</button></td>
                  </tr>
                );
              })}
              {!users.length ? <tr><td colSpan="5"><div className="chart-empty compact">No private-library users are configured.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
