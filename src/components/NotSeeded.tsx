export function NotSeeded() {
  return (
    <div className="panes panes-single">
      <section className="pane-main">
        <h1>No content yet</h1>
        <p className="psub">
          The content store is empty. A developer needs to run <code>npm run seed</code> once (see the README).
        </p>
      </section>
    </div>
  )
}
