// How Field hands its ids to the control inside it. TextInput, Select, and Textarea read this
// context, so <Field label="Title"><TextInput /></Field> wires the label, the hint, and the
// error to the input without any props passed by hand.
import { createContext, use } from "react";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export const FieldContext = createContext<FieldControlProps | null>(null);

/** The props a control spreads when it sits inside a Field, or {} when it doesn't. */
export function useFieldControl(): Partial<FieldControlProps> {
  return use(FieldContext) ?? {};
}
