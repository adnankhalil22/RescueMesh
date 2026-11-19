export default function EventLog({ log }) {
  const items = [...log].reverse().slice(0, 40);
  return (
    <section className="panel event-log">
      <h2>Event log</h2>
      <ol>
        {items.map((e, i) => (
          <li key={`${e.t}-${i}`} className={`log-${e.kind}`}>
            <time>{new Date(e.t).toLocaleTimeString()}</time> {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
