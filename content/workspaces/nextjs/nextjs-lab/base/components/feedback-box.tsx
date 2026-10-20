"use client";

import { useId, useState } from "react";

export function FeedbackBox() {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p role="status" className="rounded-lg bg-brand-light p-4 text-sm">
        Thanks for the feedback!
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
      className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-4"
    >
      <label htmlFor={fieldId} className="text-sm font-medium">
        Was this page helpful?
      </label>
      <textarea
        id={fieldId}
        name="feedback"
        rows={3}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        className="rounded-md border border-stone-300 p-2 text-sm"
      />
      <button
        type="submit"
        disabled={message.trim() === ""}
        className="self-start rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Send feedback
      </button>
    </form>
  );
}
