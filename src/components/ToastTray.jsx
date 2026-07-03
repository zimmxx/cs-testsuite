export default function ToastTray({ items }) {
  if (!items.length) return null;
  return (
    <div className="toast-tray" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`toast-card ${item.tone || "info"}`}>
          <strong>{item.title}</strong>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
