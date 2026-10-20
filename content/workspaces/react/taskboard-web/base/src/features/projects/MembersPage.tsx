// The Members tab: everyone in the project and their role, from the project's own query, which
// the loader already put in the cache.
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { projectQueries } from "./api";
import styles from "./MembersPage.module.css";
import { useProjectId } from "./use-project-id";

export function MembersPage() {
  const { data: project } = useQuery(projectQueries.detail(useProjectId()));
  if (!project) return null;

  return (
    <section aria-labelledby="members-heading" className={styles.page}>
      <h2 id="members-heading" className={styles.heading}>
        {project.members.length === 1 ? "1 member" : `${project.members.length} members`}
      </h2>
      <ul role="list" className={styles.list}>
        {project.members.map((member) => (
          <li key={member.user_id} className={styles.member}>
            <Avatar name={member.name} size={32} />
            <div>
              <p className={styles.name}>{member.name}</p>
              <p className={styles.email}>{member.email}</p>
            </div>
            <Tag tone={member.role === "owner" ? "info" : "neutral"}>{member.role === "owner" ? "Owner" : "Member"}</Tag>
          </li>
        ))}
      </ul>
    </section>
  );
}
