import { withLock } from "./sessions-store";

async function main(): Promise<void> {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: node pin.js <session_id>");
    process.exit(1);
  }

  await withLock((data) => {
    const session = data.sessions[sessionId];
    if (!session) {
      console.log(`Session ${sessionId} not found.`);
      return;
    }

    session.pinned = !session.pinned;

    // Update status based on pin state
    if (session.pinned && session.status === "archived") {
      session.status = "pinned";
      session.ended_at = session.ended_at || new Date().toISOString();
    } else if (!session.pinned && session.status === "pinned") {
      session.status = "archived";
    }

    if (session.pinned) {
      console.log(
        "Session pinned — it will stay in the dashboard after you exit."
      );
    } else {
      console.log("Session unpinned.");
    }
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
