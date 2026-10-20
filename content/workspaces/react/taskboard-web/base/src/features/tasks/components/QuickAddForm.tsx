// Quick add: a one-field <Form method="post"> that adds a task to To do. It submits to the board
// route's action (quickAddAction) the way a server-rendered form posts to its page, without a
// fetch call in sight. useActionData returns what the action returned: the new task, or the
// server's field errors, shown under the field with the typed text kept.
import { Form, useActionData, useNavigation } from "react-router";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { fieldMessage } from "@/lib/api-client";
import type { QuickAddResult } from "../loaders";
import styles from "./TaskBoard.module.css";

export function QuickAddForm() {
  const result = useActionData<QuickAddResult>();
  const navigation = useNavigation();
  const adding = navigation.state === "submitting" && navigation.formMethod === "POST" && navigation.formData?.has("title");
  const error = result && "errors" in result ? fieldMessage("Title", result.errors.title) : undefined;

  return (
    // A new key after each success remounts the form, which empties the field.
    <Form method="post" key={result && "created" in result ? result.created.id : "new"} className={styles.quickAdd}>
      <Field label="Quick add" error={error}>
        <TextInput name="title" placeholder="A task for To do" autoComplete="off" />
      </Field>
      <Button type="submit" disabled={adding}>
        {adding ? "Adding..." : "Add"}
      </Button>
    </Form>
  );
}
