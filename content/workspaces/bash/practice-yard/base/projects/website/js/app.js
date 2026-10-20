// Opens and closes the navigation on small screens.
$q.ready(() => {
  const button = $q.one(".menu-button");
  const nav = $q.one(".site-nav");
  if (!button || !nav) return;

  button.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
});
