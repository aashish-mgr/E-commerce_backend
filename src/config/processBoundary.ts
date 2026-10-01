/**
 * Last-resort handlers for failures that escape the Express pipeline.
 *
 * Node's default for `unhandledRejection` is to crash the process, so without
 * these a single stray rejection anywhere in the app takes the whole API down.
 */
export const registerProcessErrorBoundary = (): void => {
  process.on("unhandledRejection", (reason) => {
    // Fail-open: log and keep serving. A rejected request should not take the
    // process down with it.
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    // A synchronous throw outside any request leaves state that cannot be
    // trusted, so exit and let the supervisor restart cleanly.
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
};
