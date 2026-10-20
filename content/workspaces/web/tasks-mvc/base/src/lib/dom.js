// Small DOM helpers shared by the views and the controller.

/** The first element that matches selector, or an error that names the selector. */
export function qs(selector, root = document) {
  const element = root.querySelector(selector);
  if (element === null) throw new Error(`Nothing matches ${selector}`);
  return element;
}

/** Every element that matches selector, as an array. */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Event delegation: one listener on root handles an event from any element
 * inside it that matches selector, including elements added later. The
 * handler gets the event and the matching element.
 * @returns {() => void} a function that removes the listener
 */
export function delegate(root, type, selector, handler) {
  function listener(event) {
    const match = event.target instanceof Element ? event.target.closest(selector) : null;
    if (match !== null && root.contains(match)) handler(event, match);
  }
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
