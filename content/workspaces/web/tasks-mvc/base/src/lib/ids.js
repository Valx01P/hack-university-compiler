// Ids for new tasks.

/**
 * A random UUID, such as "3b241101-e2bb-4255-8caf-4136c566a962".
 * crypto.randomUUID() exists only in secure contexts: https, or http on localhost.
 */
export function newId() {
  return crypto.randomUUID();
}
