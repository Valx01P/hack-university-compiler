export type TeamMember = {
  name: string;
  role: string;
  bio: string;
};

export const team: TeamMember[] = [
  {
    name: "Maya Lindgren",
    role: "Co-founder, gear buyer",
    bio: "Tests every pack on the Colorado Trail before it reaches the shop.",
  },
  {
    name: "Owen Park",
    role: "Co-founder, operations",
    bio: "Runs the warehouses and answers the hardest shipping questions.",
  },
  {
    name: "Rosa Alvarez",
    role: "Customer care lead",
    bio: "Helps you pick the right tent, then asks how the trip went.",
  },
];
