// The poster upload page: log in, then send the chosen file as multipart/form-data. FormData
// sets the multipart Content-Type and boundary itself, so the code never names them.
const form = document.getElementById("upload");
const result = document.getElementById("result");
const link = document.getElementById("link");

async function problemText(response) {
  const body = await response.json().catch(() => null);
  return `${response.status} ${body?.title ?? response.statusText}: ${body?.detail ?? ""}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  result.textContent = "Logging in...";
  link.replaceChildren();

  const login = await fetch("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
  });
  if (!login.ok) {
    result.textContent = `Login failed. ${await problemText(login)}`;
    return;
  }
  const { accessToken } = await login.json();

  const upload = new FormData();
  upload.append("poster", fields.get("poster"));
  result.textContent = "Uploading...";
  const response = await fetch(`/v1/events/${encodeURIComponent(fields.get("eventId"))}/poster`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: upload,
  });
  if (!response.ok) {
    result.textContent = `Upload refused. ${await problemText(response)}`;
    return;
  }
  const saved = await response.json();
  result.textContent = `Stored at ${saved.posterUrl}`;
  const page = document.createElement("a");
  page.href = `/e/${saved.slug}`;
  page.textContent = `See it on /e/${saved.slug}`;
  link.append(page);
});
