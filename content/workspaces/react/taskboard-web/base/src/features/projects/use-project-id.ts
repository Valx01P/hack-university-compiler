// The :projectId of the current URL as a number. Route params are always strings, and the
// project's loader has already turned a missing or non-numeric id into a 404.
import { useParams } from "react-router";

export function useProjectId(): number {
  const { projectId } = useParams();
  return Number(projectId);
}
